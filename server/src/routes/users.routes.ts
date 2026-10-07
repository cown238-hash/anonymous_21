import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { ok, paginate } from '../lib/http.js';
import { validateQuery, getQuery } from '../middleware/validate.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';
import { onlineUserIds } from '../realtime/emitter.js';

const router = Router();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(12),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['newest', 'posts', 'followers']).default('newest'),
});

/** GET /api/users - directory with search + sorting. */
router.get(
  '/',
  validateQuery(listSchema),
  asyncHandler(async (req, res) => {
    const { page, perPage, q, sort } = getQuery<z.infer<typeof listSchema>>(req);
    // Hidden accounts vanish from the directory for everyone except admins,
    // who still need to see (and moderate) the whole roster.
    const hideHidden = req.user?.role !== 'ADMIN' ? { isHidden: false } : {};

    const where = q
      ? {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' as const } },
            { username: { contains: q, mode: 'insensitive' as const } },
            { bio: { contains: q, mode: 'insensitive' as const } },
          ],
          isBanned: false,
          ...hideHidden,
        }
      : { isBanned: false, ...hideHidden };

    const orderBy =
      sort === 'posts'
        ? { posts: { _count: 'desc' as const } }
        : sort === 'followers'
          ? { createdAt: 'asc' as const }
          : { lastSeenAt: 'desc' as const };

    const isAdminView = req.user?.role === 'ADMIN';

    const [total, users, postCounts, commentCounts] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { ...publicUserSelect, ...(isAdminView ? { isHidden: true } : {}) },
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.post.groupBy({
        by: ['authorId'],
        where: { author: { isBanned: false } },
        _count: { _all: true },
      }),
      prisma.comment.groupBy({
        by: ['authorId'],
        where: { author: { isBanned: false } },
        _count: { _all: true },
      }),
    ]);

    const postMap = new Map(postCounts.map((r) => [r.authorId, r._count._all]));
    const commentMap = new Map(commentCounts.map((r) => [r.authorId, r._count._all]));
    const online = new Set(onlineUserIds());

    const items = users.map((u) => ({
      ...serializeUser(u),
      // So the admin UI can badge hidden accounts. Absent for everyone else.
      ...('isHidden' in u ? { isHidden: (u as { isHidden: boolean }).isHidden } : {}),
      stats: {
        posts: postMap.get(u.id) ?? 0,
        comments: commentMap.get(u.id) ?? 0,
      },
      isOnline: online.has(u.id),
    }));

    return ok(res, paginate(items, total, page, perPage));
  }),
);

/** GET /api/users/online */
router.get(
  '/online',
  asyncHandler(async (req, res) => {
    const ids = onlineUserIds();
    const users = await prisma.user.findMany({
      // A hidden account must not leak through the online roster either.
      where: { id: { in: ids }, ...(req.user?.role === 'ADMIN' ? {} : { isHidden: false }) },
      select: publicUserSelect,
      orderBy: { lastSeenAt: 'desc' },
    });
    return ok(res, users.map((u) => ({ ...serializeUser(u), isOnline: true })));
  }),
);

/** GET /api/users/:username - profile with public stats and recent posts. */
router.get(
  '/:username',
  asyncHandler(async (req, res) => {
    const { username } = req.params;
    const user = await prisma.user.findUnique({
      where: { username },
      select: { ...publicUserSelect, isBanned: true, isHidden: true },
    });
    if (!user || (user.isBanned && req.user?.role !== 'ADMIN')) throw HttpError.notFound('ไม่พบผู้ใช้นี้');
    // A hidden profile resolves only for its owner and for admins. Everyone
    // else gets the same 404 as a missing account, so hiding is not detectable.
    if (user.isHidden && req.user?.id !== user.id && req.user?.role !== 'ADMIN') {
      throw HttpError.notFound('ไม่พบผู้ใช้นี้');
    }

    const [posts, postCount, commentCount, likeCount, online] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id, status: 'PUBLISHED' },
        select: {
          id: true,
          slug: true,
          title: true,
          excerpt: true,
          coverImage: true,
          viewCount: true,
          readMinutes: true,
          publishedAt: true,
          createdAt: true,
          _count: { select: { comments: true, likes: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.post.count({ where: { authorId: user.id, status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { authorId: user.id } }),
      prisma.like.count({ where: { user: { id: user.id }, post: { authorId: user.id } } }),
      Promise.resolve(onlineUserIds().includes(user.id)),
    ]);

    // The flag stays server-side here: it is only ever exposed on the owner's
    // own record (/me) and to admins in the directory.
    const { isHidden: _hidden, ...visible } = user;
    return ok(res, {
      user: serializeUser(visible),
      isOnline: online,
      stats: { posts: postCount, comments: commentCount, likesReceived: likeCount },
      recentPosts: posts,
    });
  }),
);

/** GET /api/users/:username/posts */
router.get(
  '/:username/posts',
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(50).default(9),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { page, perPage } = getQuery<{ page: number; perPage: number }>(req);
    const { postInclude, serializePost } = await import('../serializers/index.js');

    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, isBanned: true },
    });
    if (!user) throw HttpError.notFound('ไม่พบผู้ใช้นี้');

    const where = {
      authorId: user.id,
      ...(req.user?.id === user.id || req.user?.role === 'ADMIN' ? {} : { status: 'PUBLISHED' as const }),
    };

    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        include: postInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return ok(res, paginate(posts.map((p) => serializePost(p, req.user?.id)), total, page, perPage));
  }),
);

export default router;