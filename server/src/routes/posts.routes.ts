import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { PostStatus, Role, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, noContent, ok, paginate } from '../lib/http.js';
import { validateBody, validateQuery, getQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { removeUpload, removeUploadByFilename, isSafeInline } from '../middleware/upload.js';
import { env } from '../config/env.js';
import { postInclude, serializePost, serializeTag } from '../serializers/index.js';
import { slugify, uniqueSlug, estimateReadMinutes, excerptFrom } from '../utils/text.js';
import { notify } from '../services/notifications.js';
import { removePostLikes, removePostComments, removePostTagLinks } from '../services/post-cleanup.js';

const router = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  author: z.string().trim().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'oldest', 'popular', 'trending']).default('newest'),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const createSchema = z.object({
  title: z.string().trim().min(5, 'หัวข้ออย่างน้อย 5 ตัวอักษร').max(180),
  content: z.string().trim().min(20, 'เนื้อหาอย่างน้อย 20 ตัวอักษร').max(60_000),
  excerpt: z.string().trim().max(300).optional(),
  coverImage: z.string().trim().max(400).nullable().optional(),
  categoryId: z.string().trim().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(8, 'ใส่ได้สูงสุด 8 แท็ก').default([]),
  /// Ids returned by POST /api/uploads/files. Ownership is verified server-side.
  attachmentIds: z.array(z.string().trim().min(1)).max(20).default([]),
  status: z.nativeEnum(PostStatus).default(PostStatus.PUBLISHED),
  featured: z.boolean().default(false),
});
type CreateBody = z.infer<typeof createSchema>;

const updateSchema = createSchema.partial().extend({
  removeCover: z.boolean().default(false),
  /// Attachment ids to detach; the stored file is deleted with the row.
  removedAttachmentIds: z.array(z.string().trim().min(1)).max(20).default([]),
});
type UpdateBody = z.infer<typeof updateSchema>;

/**
 * Claims pending uploads for a post. Only rows the caller uploaded and that
 * are not already attached somewhere are taken, so a guessed id is a no-op
 * rather than a way to steal another member's file.
 */
async function claimAttachments(postId: string, ids: string[], userId: string): Promise<number> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 0;

  const owned = await prisma.attachment.findMany({
    where: { id: { in: unique }, uploadedById: userId, postId: null },
    select: { id: true },
  });
  if (owned.length === 0) return 0;

  const { count } = await prisma.attachment.updateMany({
    where: { id: { in: owned.map((a) => a.id) }, postId: null },
    data: { postId },
  });
  return count;
}

/** Detaches files and deletes both the row and the bytes on disk. */
async function dropAttachments(postId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;

  const rows = await prisma.attachment.findMany({
    where: { id: { in: unique }, postId },
    select: { id: true, filename: true },
  });
  if (rows.length === 0) return;

  await prisma.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  for (const row of rows) removeUploadByFilename(row.filename);
}

async function syncTags(postId: string, names: string[]): Promise<void> {
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const slugSet = cleaned.map(slugify);
  const existing = await prisma.tag.findMany({ where: { slug: { in: slugSet } } });
  const bySlug = new Map(existing.map((t) => [t.slug, t]));

  const tags = await Promise.all(
    slugSet.map(async (slug) => {
      const found = bySlug.get(slug);
      if (found) return found;
      return prisma.tag.create({ data: { slug, name: cleaned[slugSet.indexOf(slug)] } });
    }),
  );

  await prisma.postTag.deleteMany({ where: { postId } });
  if (tags.length) {
    await prisma.postTag.createMany({
      data: tags.map((tag) => ({ postId, tagId: tag.id })),
      skipDuplicates: true,
    });
  }
}

/** GET /api/posts - searchable, filterable, paginated feed. */
router.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, perPage, q, category, tag, author, status, featured, sort } = getQuery<ListQuery>(req);
    const viewerId = req.user?.id;
    const isAdmin = req.user?.role === 'ADMIN';

    const where: Prisma.PostWhereInput = {
      // Hide drafts/archived from everyone except the author and admins.
      ...(status
        ? { status }
        : viewerId
          ? { OR: [{ status: PostStatus.PUBLISHED }, { authorId: viewerId }] }
          : { status: PostStatus.PUBLISHED }),
      ...(featured ? { featured: featured === 'true' } : {}),
      ...(author ? { author: { username: author } } : {}),
      ...(category ? { category: { slug: category } } : {}),
      ...(tag ? { tags: { some: { tag: { slug: tag } } } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
              { excerpt: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.PostOrderByWithRelationInput[] =
      sort === 'oldest'
        ? [{ createdAt: 'asc' }]
        : sort === 'popular'
          ? [{ viewCount: 'desc' }, { createdAt: 'desc' }]
          : sort === 'trending'
            ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
            : [{ featured: 'desc' }, { createdAt: 'desc' }];

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        include: postInclude,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return ok(res, paginate(posts.map((p) => serializePost(p, viewerId)), total, page, perPage));
  }),
);

/** GET /api/posts/:slugOrId */
router.get(
  '/:idOrSlug',
  asyncHandler(async (req, res) => {
    const key = req.params.idOrSlug;
    const viewerId = req.user?.id;
    const post = await prisma.post.findFirst({
      where: { OR: [{ slug: key }, { id: key }] },
      include: postInclude,
    });
    if (!post) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');

    const isOwner = viewerId === post.authorId;
    if (post.status !== PostStatus.PUBLISHED && !isOwner && req.user?.role !== 'ADMIN') {
      throw HttpError.notFound('ไม่พบบทความที่ต้องการ');
    }

    // Fire-and-forget view counter; do not block the response.
    prisma.post
      .update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => undefined);

    // More from the same category / tags.
    const related = await prisma.post.findMany({
      where: {
        id: { not: post.id },
        status: PostStatus.PUBLISHED,
        OR: [
          ...(post.categoryId ? [{ categoryId: post.categoryId }] : []),
          { tags: { some: { tagId: { in: post.tags.map((t) => t.tagId) } } } },
        ],
      },
      include: postInclude,
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return ok(res, {
      post: serializePost({ ...post, viewCount: post.viewCount + 1 }, viewerId),
      related: related.map((p) => serializePost(p, viewerId)),
    });
  }),
);

/** GET /api/posts/mine/list - the signed-in user's own posts. */
router.get(
  '/mine/list',
  requireAuth,
  validateQuery(z.object({ page: z.coerce.number().int().min(1).default(1), perPage: z.coerce.number().int().min(1).max(50).default(10) })),
  asyncHandler(async (req, res) => {
    const { page, perPage } = getQuery<{ page: number; perPage: number }>(req);
    const where: Prisma.PostWhereInput = { authorId: req.user!.id };
    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return ok(res, paginate(posts.map((p) => serializePost(p, req.user!.id)), total, page, perPage));
  }),
);

router.post(
  '/',
  requireAuth,
  writeLimiter,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBody;

    const slug = await uniqueSlug(slugify(body.title), async (candidate) =>
      (await prisma.post.count({ where: { slug: candidate } })) > 0,
    );

    const post = await prisma.post.create({
      data: {
        title: body.title,
        slug,
        content: body.content,
        excerpt: body.excerpt?.trim() || excerptFrom(body.content),
        coverImage: body.coverImage ?? null,
        categoryId: body.categoryId ?? null,
        status: body.status,
        featured: body.featured,
        readMinutes: estimateReadMinutes(body.content),
        publishedAt: body.status === PostStatus.PUBLISHED ? new Date() : null,
        authorId: req.user!.id,
        tags: {
          create: await Promise.all(
            [...new Set(body.tags.map(slugify))].map(async (tagSlug) => {
              const name = body.tags.find((t) => slugify(t) === tagSlug)!;
              return { tag: { connectOrCreate: { where: { slug: tagSlug }, create: { slug: tagSlug, name } } } };
            }),
          ),
        },
      },
      include: postInclude,
    });

    await claimAttachments(post.id, body.attachmentIds, req.user!.id);
    await enforceAttachmentLimit(post.id);
    const withFiles = await prisma.post.findUniqueOrThrow({ where: { id: post.id }, include: postInclude });

    return created(res, serializePost(withFiles, req.user!.id));
  }),
);

router.patch(
  '/:id',
  requireAuth,
  writeLimiter,
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body as UpdateBody;
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');
    if (existing.authorId !== req.user!.id && req.user!.role !== 'ADMIN') throw HttpError.forbidden();

    if (body.removeCover) body.coverImage = null;

    await prisma.post.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined
          ? { content: body.content, readMinutes: estimateReadMinutes(body.content) }
          : {}),
        ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
        ...(body.coverImage !== undefined ? { coverImage: body.coverImage } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.status !== undefined
          ? {
              status: body.status,
              ...(body.status === PostStatus.PUBLISHED && !existing.publishedAt
                ? { publishedAt: new Date() }
                : {}),
            }
          : {}),
        ...(body.featured !== undefined ? { featured: body.featured } : {}),
      },
    });

    if (body.tags) await syncTags(id, body.tags);
    if (body.removeCover) removeUpload(existing.coverImage);

    await dropAttachments(id, body.removedAttachmentIds ?? []);
    await claimAttachments(id, body.attachmentIds ?? [], req.user!.id);
    await enforceAttachmentLimit(id);

    const fresh = await prisma.post.findUniqueOrThrow({ where: { id }, include: postInclude });
    return ok(res, serializePost(fresh, req.user!.id));
  }),
);

/** Trims a post back to the cap, newest kept, deleting the surplus files. */
async function enforceAttachmentLimit(postId: string): Promise<void> {
  const rows = await prisma.attachment.findMany({
    where: { postId },
    select: { id: true, filename: true },
    orderBy: { createdAt: 'desc' },
  });
  const surplus = rows.slice(env.MAX_ATTACHMENTS_PER_POST);
  if (surplus.length === 0) return;
  await prisma.attachment.deleteMany({ where: { id: { in: surplus.map((r) => r.id) } } });
  for (const row of surplus) removeUploadByFilename(row.filename);
}

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');
    if (post.authorId !== req.user!.id && req.user!.role !== 'ADMIN') throw HttpError.forbidden();

    // Collect filenames first: the cascade removes the rows, and the bytes on
    // disk have to be cleaned up separately.
    const attachments = await prisma.attachment.findMany({
      where: { postId: id },
      select: { filename: true },
    });

    // Break relations explicitly so cascades stay predictable across providers.
    await prisma.$transaction([
      removePostTagLinks(id),
      removePostComments(id),
      removePostLikes(id),
      prisma.post.delete({ where: { id } }),
    ]);
    removeUpload(post.coverImage);
    for (const file of attachments) removeUploadByFilename(file.filename);

    return noContent(res);
  }),
);

/** DELETE /api/posts/:id/attachments/:attachmentId - remove one attached file. */
router.delete(
  '/:id/attachments/:attachmentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: { id: true, authorId: true },
    });
    if (!post) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');
    if (post.authorId !== req.user!.id && req.user!.role !== 'ADMIN') throw HttpError.forbidden();

    await dropAttachments(post.id, [req.params.attachmentId]);
    return noContent(res);
  }),
);

/**
 * GET /api/posts/:slugOrId/attachments/:attachmentId - serve the stored file.
 *
 * Files are never exposed through the static `/uploads` mount: going through
 * this route means the client can only reach bytes it was handed an id for, and
 * lets the response force a download for anything that is not a plain image.
 */
router.get(
  '/:slugOrId/attachments/:attachmentId',
  asyncHandler(async (req, res) => {
    const post = await prisma.post.findFirst({
      where: { OR: [{ id: req.params.slugOrId }, { slug: req.params.slugOrId }] },
      select: {
        id: true,
        status: true,
        authorId: true,
        attachments: {
          where: { id: req.params.attachmentId },
          select: { id: true, filename: true, originalName: true, mimeType: true },
        },
      },
    });
    const file = post?.attachments[0];
    if (!post || !file) throw HttpError.notFound('ไม่พบไฟล์ที่ต้องการ');

    // A draft's files stay private to its author and to admins.
    if (post.status === PostStatus.DRAFT) {
      const viewer = req.user;
      if (!viewer || (viewer.id !== post.authorId && viewer.role !== Role.ADMIN)) {
        throw HttpError.notFound('ไม่พบไฟล์ที่ต้องการ');
      }
    }

    const absolute = path.join(env.uploadDir, path.basename(file.filename));
    if (!fs.existsSync(absolute)) throw HttpError.notFound('ไฟล์ถูกลบไปแล้ว');

    const wantDownload = req.query.download === '1';
    const canInline = isSafeInline(file.mimeType) && !wantDownload;
    const stat = await fs.promises.stat(absolute);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Type', canInline ? file.mimeType : 'application/octet-stream');
    // `filename*` keeps non-ASCII names intact; the plain form is a fallback for
    // clients that ignore RFC 5987. Quotes and backslashes would break the header.
    const asciiFallback = file.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `${canInline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );

    return new Promise<void>((resolve, reject) => {
      const stream = fs.createReadStream(absolute);
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.pipe(res);
    });
  }),
);

/** POST /api/posts/:id/like - toggles a like (idempotent result via `liked`). */
router.post(
  '/:id/like',
  requireAuth,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true, title: true } });
    if (!post) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');

    const existing = await prisma.like.findUnique({ where: { userId_postId: { userId, postId: id } } });
    if (existing) {
      await prisma.like.delete({ where: { userId_postId: { userId, postId: id } } });
    } else {
      await prisma.like.create({ data: { userId, postId: id } });
      if (post.authorId !== userId) {
        await notify({
          userId: post.authorId,
          actorId: userId,
          type: 'LIKE',
          title: `${req.user!.displayName} ถูกใจบทความของคุณ`,
          href: `/posts/${id}`,
          payload: { postId: id },
        });
      }
    }

    const likeCount = await prisma.like.count({ where: { postId: id } });
    return ok(res, { liked: !existing, likeCount });
  }),
);

/** GET /api/posts/:id/likes - who liked it. */
router.get(
  '/:id/likes',
  asyncHandler(async (req, res) => {
    const likes = await prisma.like.findMany({
      where: { postId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { createdAt: true, user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });
    return ok(
      res,
      likes.map((l) => ({ likedAt: l.createdAt, user: l.user })),
    );
  }),
);

/** GET /api/posts/:id/tags */
router.get(
  '/:id/tags',
  asyncHandler(async (req, res) => {
    const rows = await prisma.postTag.findMany({
      where: { postId: req.params.id },
      select: { tag: { select: { id: true, name: true, slug: true } } },
    });
    return ok(res, rows.map((r) => serializeTag(r.tag)));
  }),
);

export default router;