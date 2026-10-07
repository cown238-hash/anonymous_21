import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ok } from '../lib/http.js';
import { publicUserSelect, serializeUser, postInclude, serializePost, categorySelect, serializeCategory, tagSelect, serializeTag } from '../serializers/index.js';

const router = Router();

/**
 * GET /api/stats/overview
 * Public aggregates powering the landing page and the dashboard charts.
 */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const days = 14;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [userCount, postCount, commentCount, messageCount, onlineNow] = await Promise.all([
      prisma.user.count({ where: { isBanned: false } }),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
      prisma.comment.count({ where: { isDeleted: false } }),
      prisma.message.count(),
      import('../realtime/emitter.js').then((m) => m.onlineUserIds().length),
    ]);

    const [posts, comments, users] = await Promise.all([
      prisma.post.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.comment.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    ]);

    const buckets = Array.from({ length: days }, (_, i) => {
      const day = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      return { date: key, posts: 0, comments: 0, users: 0 };
    });
    const index = new Map(buckets.map((b, i) => [b.date, i]));
    for (const p of posts) {
      const i = index.get(p.createdAt.toISOString().slice(0, 10));
      if (i !== undefined) buckets[i].posts++;
    }
    for (const c of comments) {
      const i = index.get(c.createdAt.toISOString().slice(0, 10));
      if (i !== undefined) buckets[i].comments++;
    }
    for (const u of users) {
      const i = index.get(u.createdAt.toISOString().slice(0, 10));
      if (i !== undefined) buckets[i].users++;
    }

    return ok(res, {
      totals: { users: userCount, posts: postCount, comments: commentCount, messages: messageCount },
      onlineNow,
      activity: buckets,
    });
  }),
);

/** GET /api/stats/popular-tags */
router.get(
  '/popular-tags',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.postTag.groupBy({
      by: ['tagId'],
      _count: { _all: true },
      orderBy: { _count: { tagId: 'desc' } },
      take: 12,
    });
    const tags = await prisma.tag.findMany({ where: { id: { in: rows.map((r) => r.tagId) } }, select: tagSelect });
    const map = new Map(rows.map((r) => [r.tagId, r._count._all]));
    return ok(res, tags.map((t) => ({ ...serializeTag(t), count: map.get(t.id) ?? 0 })));
  }),
);

/**
 * GET /api/stats/me - private dashboard numbers for the signed-in user.
 * Requires auth via `attachUser`; returns nulls when signed out.
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return ok(res, {
        posts: 0,
        drafts: 0,
        comments: 0,
        likesReceived: 0,
        likesGiven: 0,
        unreadNotifications: 0,
        unreadMessages: 0,
        viewsTotal: 0,
        recentViews: [],
      });
    }

    const userId = req.user.id;
    const [posts, drafts, comments, likesReceived, likesGiven, unreadNotifications, views] =
      await Promise.all([
        prisma.post.count({ where: { authorId: userId, status: 'PUBLISHED' } }),
        prisma.post.count({ where: { authorId: userId, status: 'DRAFT' } }),
        prisma.comment.count({ where: { authorId: userId, isDeleted: false } }),
        prisma.like.count({ where: { post: { authorId: userId } } }),
        prisma.like.count({ where: { userId } }),
        prisma.notification.count({ where: { userId, readAt: null } }),
        prisma.post.findMany({
          where: { authorId: userId },
          select: { id: true, title: true, slug: true, viewCount: true, _count: { select: { comments: true, likes: true } } },
          orderBy: { viewCount: 'desc' },
          take: 5,
        }),
      ]);

    const memberships = await prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });
    const unreadMessages = await Promise.all(
      memberships.map((m) =>
        prisma.message.count({
          where: {
            conversationId: m.conversationId,
            senderId: { not: userId },
            createdAt: { gt: m.lastReadAt ?? new Date(0) },
          },
        }),
      ),
    );

    return ok(res, {
      posts,
      drafts,
      comments,
      likesReceived,
      likesGiven,
      unreadNotifications,
      unreadMessages: unreadMessages.reduce((a, b) => a + b, 0),
      viewsTotal: views.reduce((sum, p) => sum + p.viewCount, 0),
      recentViews: views,
    });
  }),
);

/** GET /api/stats/categories */
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { ...categorySelect, _count: { select: { posts: true } } },
    });
    return ok(
      res,
      categories.map((c) => ({ ...serializeCategory(c), postCount: c._count.posts })),
    );
  }),
);

/** GET /api/stats/contributors - leaderboard. */
router.get(
  '/contributors',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { isBanned: false },
      select: { ...publicUserSelect, _count: { select: { posts: true, comments: true } } },
      take: 100,
    });

    const likes = await prisma.like.groupBy({
      by: ['userId'],
      _count: { _all: true },
    });
    const likeMap = new Map(likes.map((l) => [l.userId, l._count._all]));

    const ranked = users
      .map((u) => ({
        ...serializeUser(u),
        posts: u._count.posts,
        comments: u._count.comments,
        likesGiven: likeMap.get(u.id) ?? 0,
        score: u._count.posts * 3 + u._count.comments * 2 + (likeMap.get(u.id) ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return ok(res, ranked);
  }),
);

/** GET /api/stats/latest - latest published posts for the home page. */
router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const posts = await prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      include: postInclude,
      orderBy: { publishedAt: 'desc' },
      take: 6,
    });
    return ok(res, posts.map((p) => serializePost(p, req.user?.id)));
  }),
);

export default router;