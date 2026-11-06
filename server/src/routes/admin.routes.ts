import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { noContent, ok, paginate } from '../lib/http.js';
import { validateBody, validateQuery, getQuery } from '../middleware/validate.js';
import { requireAdmin } from '../middleware/auth.js';
import { removeUploadByFilename } from '../middleware/upload.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';

const router = Router();

router.use(requireAdmin);

/** GET /api/admin/stats - dashboard aggregates. */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      users,
      users7d,
      banned,
      posts,
      posts7d,
      drafts,
      comments,
      messages,
      notifications,
      categories,
      topPosts,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.post.count(),
      prisma.post.count({ where: { createdAt: { gte: since7d } } }),
      prisma.post.count({ where: { status: 'DRAFT' } }),
      prisma.comment.count(),
      prisma.message.count(),
      prisma.notification.count(),
      prisma.category.count(),
      prisma.post.findMany({
        orderBy: { viewCount: 'desc' },
        take: 5,
        select: { id: true, title: true, slug: true, viewCount: true, _count: { select: { likes: true, comments: true } } },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: publicUserSelect,
      }),
    ]);

    return ok(res, {
      totals: { users, posts, comments, messages, notifications, categories, banned, drafts },
      recent: { users7d, posts7d },
      topPosts,
      recentUsers: recentUsers.map(serializeUser),
      generatedAt: new Date(),
    });
  }),
);

/** GET /api/admin/users */
router.get(
  '/users',
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(100).default(15),
      q: z.string().trim().max(80).optional(),
      role: z.nativeEnum(Role).optional(),
      banned: z.enum(['true', 'false']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { page, perPage, q, role, banned } = getQuery<{
      page: number;
      perPage: number;
      q?: string;
      role?: Role;
      banned?: string;
    }>(req);

    const where = {
      ...(role ? { role } : {}),
      ...(banned ? { isBanned: banned === 'true' } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { username: { contains: q, mode: 'insensitive' as const } },
              { displayName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          ...publicUserSelect,
          isBanned: true,
          isHidden: true,
          updatedAt: true,
          _count: { select: { posts: true, comments: true } },
        },
      }),
    ]);

    const items = users.map((u) => ({
      ...serializeUser(u),
      isBanned: u.isBanned,
      isHidden: u.isHidden,
      updatedAt: u.updatedAt,
      postCount: u._count.posts,
      commentCount: u._count.comments,
    }));

    return ok(res, paginate(items, total, page, perPage));
  }),
);

/** PATCH /api/admin/users/:id - change role or ban state. */
router.patch(
  '/users/:id',
  validateBody(
    z.object({
      role: z.nativeEnum(Role).optional(),
      isBanned: z.boolean().optional(),
      displayName: z.string().trim().min(2).max(60).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as { role?: Role; isBanned?: boolean; displayName?: string };
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
    if (!target) throw HttpError.notFound('ไม่พบผู้ใช้');

    // Guard rails so admins cannot lock each other (or themselves) out.
    if (target.id === req.user!.id && (body.role === 'USER' || body.isBanned === true)) {
      throw HttpError.badRequest('ไม่สามารถลดระดับหรือระงับบัญชีของตัวเองได้');
    }
    if (target.role === Role.ADMIN && body.role === 'USER') {
      const adminCount = await prisma.user.count({ where: { role: Role.ADMIN } });
      if (adminCount <= 1) throw HttpError.badRequest('ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน');
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.isBanned !== undefined ? { isBanned: body.isBanned } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      },
      select: { ...publicUserSelect, isBanned: true },
    });

    if (body.isBanned) {
      await prisma.session.deleteMany({ where: { userId: target.id } });
    }

    return ok(res, { ...serializeUser(user), isBanned: user.isBanned });
  }),
);

/** DELETE /api/admin/users/:id */
router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw HttpError.badRequest('ไม่สามารถลบบัญชีของตัวเองได้');
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!target) throw HttpError.notFound('ไม่พบผู้ใช้');

    // Attachment rows cascade away with the user, so collect the filenames first
    // and delete the bytes by hand afterwards.
    const files = await prisma.attachment.findMany({
      where: { OR: [{ uploadedById: target.id }, { post: { authorId: target.id } }] },
      select: { filename: true },
    });

    await prisma.user.delete({ where: { id: target.id } });
    for (const file of files) removeUploadByFilename(file.filename);
    return noContent(res);
  }),
);

/** GET /api/admin/posts - moderation list. */
router.get(
  '/posts',
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(100).default(15),
      q: z.string().trim().max(80).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { page, perPage, q } = getQuery<{ page: number; perPage: number; q?: string }>(req);
    const where = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { content: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page -  1) * perPage,
        take: perPage,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          featured: true,
          viewCount: true,
          createdAt: true,
          author: { select: publicUserSelect },
          _count: { select: { comments: true, likes: true } },
        },
      }),
    ]);

    const items = posts.map((p) => ({
      ...p,
      author: serializeUser(p.author),
      commentCount: p._count.comments,
      likeCount: p._count.likes,
    }));

    return ok(res, paginate(items, total, page, perPage));
  }),
);

/** PATCH /api/admin/posts/:id - feature / archive / publish. */
router.patch(
  '/posts/:id',
  validateBody(
    z.object({
      featured: z.boolean().optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as { featured?: boolean; status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' };
    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        ...(body.featured !== undefined ? { featured: body.featured } : {}),
        ...(body.status !== undefined
          ? { status: body.status, ...(body.status === 'PUBLISHED' ? { publishedAt: new Date() } : {}) }
          : {}),
      },
      select: { id: true, title: true, slug: true, status: true, featured: true },
    });
    return ok(res, post);
  }),
);

export default router;