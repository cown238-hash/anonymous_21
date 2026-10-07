import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { noContent, ok, paginate } from '../lib/http.js';
import { validateQuery, getQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
  filter: z.enum(['all', 'unread']).default('all'),
});

router.use(requireAuth);

/** GET /api/notifications */
router.get(
  '/',
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const { page, perPage, filter } = getQuery<z.infer<typeof listSchema>>(req);

    const where = {
      userId: req.user!.id,
      ...(filter === 'unread' ? { readAt: null } : {}),
    };

    const [total, unreadCount, rows] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
          actor: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      }),
    ]);

    return ok(res, {
      ...paginate(rows, total, page, perPage),
      unreadCount,
    });
  }),
);

/** POST /api/notifications/:id/read */
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { readAt: new Date() },
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    });
    return ok(res, { id: req.params.id, read: true, unreadCount });
  }),
);

/** POST /api/notifications/read-all */
router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok(res, { updated: result.count, unreadCount: 0 });
  }),
);

/** DELETE /api/notifications/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await prisma.notification.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    return noContent(res);
  }),
);

/** DELETE /api/notifications - clear all. */
router.delete(
  '/',
  asyncHandler(async (req, res) => {
    await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
    return noContent(res);
  }),
);

export default router;