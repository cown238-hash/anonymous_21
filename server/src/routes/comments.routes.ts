import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, noContent, ok, paginate } from '../lib/http.js';
import { validateBody, validateQuery, getQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { commentInclude, publicUserSelect, serializeComment } from '../serializers/index.js';
import { notify } from '../services/notifications.js';

const router = Router({ mergeParams: true });

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['newest', 'oldest', 'top']).default('newest'),
});

const createSchema = z.object({
  content: z.string().trim().min(1, 'กรุณาพิมพ์ความคิดเห็น').max(4000),
  parentId: z.string().trim().nullable().optional(),
});

/** GET /api/posts/:postId/comments - flat list; client nests replies by parentId. */
router.get(
  '/',
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const { page, perPage, sort } = getQuery<z.infer<typeof listSchema>>(req);
    const postId = req.params.postId!;

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');

    const where = { postId, parentId: null };
    const orderBy = sort === 'oldest' ? { createdAt: 'asc' as const } : { createdAt: 'desc' as const };

    const [total, rows] = await Promise.all([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        include: { ...commentInclude, _count: { select: { replies: true } } },
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    // Attach replies for each root comment in one extra query.
    const replies = await prisma.comment.findMany({
      where: { postId, parentId: { in: rows.map((r) => r.id) } },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });
    const grouped = new Map<string, typeof replies>();
    for (const reply of replies) {
      const key = reply.parentId!;
      const list = grouped.get(key) ?? [];
      list.push(reply);
      grouped.set(key, list);
    }

    const items = rows.map((row) => ({
      ...serializeComment(row, req.user?.id, row._count.replies),
      replies: (grouped.get(row.id) ?? []).map((r) => serializeComment(r, req.user?.id)),
    }));

    return ok(res, paginate(items, total, page, perPage));
  }),
);

router.post(
  '/',
  requireAuth,
  writeLimiter,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const postId = req.params.postId!;
    const { content, parentId } = req.body as z.infer<typeof createSchema>;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, title: true },
    });
    if (!post) throw HttpError.notFound('ไม่พบบทความที่ต้องการ');

    let parent: { id: string; authorId: string; postId: string; parentId: string | null } | null = null;
    if (parentId) {
      parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, authorId: true, postId: true, parentId: true },
      });
      if (!parent || parent.postId !== postId) throw HttpError.badRequest('คอมเมนต์ต้นทางไม่ถูกต้อง');
      if (parent.parentId) throw HttpError.badRequest('รองรับการตอบกลับได้ 1 ระดับเท่านั้น');
    }

    const comment = await prisma.comment.create({
      data: { content, postId, authorId: req.user!.id, parentId: parent?.id ?? null },
      include: commentInclude,
    });

    const targetUserId = parent?.authorId ?? post.authorId;
    const type = parent ? ('REPLY' as const) : ('COMMENT' as const);
    await notify({
      userId: targetUserId,
      actorId: req.user!.id,
      type,
      title: `${req.user!.displayName} ${parent ? 'ตอบกลับความคิดเห็น' : 'แสดงความคิดเห็น'}ใน "${post.title}"`,
      href: `/posts/${postId}`,
      payload: { postId, commentId: comment.id },
    });

    const commentCount = await prisma.comment.count({ where: { postId, isDeleted: false } });
    return created(res, { ...serializeComment(comment, req.user!.id), commentCount });
  }),
);

router.patch(
  '/:commentId',
  requireAuth,
  writeLimiter,
  validateBody(z.object({ content: z.string().trim().min(1).max(4000) })),
  asyncHandler(async (req, res) => {
    const { content } = req.body as { content: string };
    const existing = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!existing) throw HttpError.notFound('ไม่พบความคิดเห็น');
    if (existing.authorId !== req.user!.id) throw HttpError.forbidden('แก้ไขได้เฉพาะความคิดเห็นของตัวเอง');

    const comment = await prisma.comment.update({
      where: { id: existing.id },
      data: { content },
      include: commentInclude,
    });
    return ok(res, serializeComment(comment, req.user!.id));
  }),
);

router.delete(
  '/:commentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!existing) throw HttpError.notFound('ไม่พบความคิดเห็น');
    if (existing.authorId !== req.user!.id && req.user!.role !== 'ADMIN') throw HttpError.forbidden();

    const replyCount = await prisma.comment.count({ where: { parentId: existing.id } });
    if (replyCount > 0) {
      // Soft delete keeps the thread readable instead of orphaning replies.
      await prisma.comment.update({
        where: { id: existing.id },
        data: { isDeleted: true, content: 'ลบความคิดเห็นนี้แล้ว' },
      });
    } else {
      await prisma.comment.delete({ where: { id: existing.id } });
    }

    const commentCount = await prisma.comment.count({
      where: { postId: existing.postId, isDeleted: false },
    });
    return ok(res, { deleted: true, commentCount });
  }),
);

/** GET /api/posts/:postId/comments/:commentId/replies */
router.get(
  '/:commentId/replies',
  asyncHandler(async (req, res) => {
    const replies = await prisma.comment.findMany({
      where: { parentId: req.params.commentId },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return ok(res, replies.map((r) => serializeComment(r, req.user?.id)));
  }),
);

export default router;