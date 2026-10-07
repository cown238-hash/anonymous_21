import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

/**
 * GET /api/health - shallow liveness probe. Never touches the database so a
 * database outage cannot make an orchestrator kill an otherwise healthy
 * process.
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      timestamp: new Date().toISOString(),
    },
  });
});

/** GET /api/ready - readiness probe; 503 when a dependency is unavailable. */
router.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, { ok: boolean; ms: number; detail?: string }> = {};

    const time = async (name: string, fn: () => Promise<unknown>) => {
      const t0 = Date.now();
      try {
        await fn();
        checks[name] = { ok: true, ms: Date.now() - t0 };
      } catch (err) {
        checks[name] = {
          ok: false,
          ms: Date.now() - t0,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    };

    await time('database', () => prisma.$queryRaw`SELECT 1`);

    const ready = Object.values(checks).every((c) => c.ok);
    res.status(ready ? 200 : 503).json({
      success: ready,
      data: {
        status: ready ? 'ready' : 'not_ready',
        checks,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

/** GET /api/metrics - Prometheus text exposition. */
router.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);

    const [
      users,
      activeUsers,
      bannedUsers,
      posts,
      publishedPosts,
      comments,
      messages,
      openReports,
      sessions,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, lastSeenAt: { gte: activeCutoff } } }),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.post.count(),
      prisma.post.count({ where: { status: 'PUBLISHED' } }),
      prisma.comment.count(),
      prisma.message.count(),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.session.count({ where: { expiresAt: { gt: new Date() } } }),
    ]);

    const memory = process.memoryUsage();

    const lines = [
      '# HELP nimbus_users_total Total registered accounts',
      '# TYPE nimbus_users_total gauge',
      `nimbus_users_total ${users}`,
      '# HELP nimbus_users_active_15m Accounts active in the last 15 minutes',
      '# TYPE nimbus_users_active_15m gauge',
      `nimbus_users_active_15m ${activeUsers}`,
      '# HELP nimbus_users_banned_total Banned accounts',
      '# TYPE nimbus_users_banned_total gauge',
      `nimbus_users_banned_total ${bannedUsers}`,
      '# HELP nimbus_posts_total Posts',
      '# TYPE nimbus_posts_total gauge',
      `nimbus_posts_total ${posts}`,
      '# HELP nimbus_posts_published_total Published posts',
      '# TYPE nimbus_posts_published_total gauge',
      `nimbus_posts_published_total ${publishedPosts}`,
      '# HELP nimbus_comments_total Comments',
      '# TYPE nimbus_comments_total gauge',
      `nimbus_comments_total ${comments}`,
      '# HELP nimbus_messages_total Chat messages',
      '# TYPE nimbus_messages_total gauge',
      `nimbus_messages_total ${messages}`,
      '# HELP nimbus_reports_open_total Open moderation reports',
      '# TYPE nimbus_reports_open_total gauge',
      `nimbus_reports_open_total ${openReports}`,
      '# HELP nimbus_sessions_active_total Active refresh sessions',
      '# TYPE nimbus_sessions_active_total gauge',
      `nimbus_sessions_active_total ${sessions}`,
      '# HELP nimbus_process_uptime_seconds Process uptime',
      '# TYPE nimbus_process_uptime_seconds gauge',
      `nimbus_process_uptime_seconds ${Math.round(process.uptime())}`,
      '# HELP nimbus_process_resident_memory_bytes Resident memory',
      '# TYPE nimbus_process_resident_memory_bytes gauge',
      `nimbus_process_resident_memory_bytes ${memory.rss}`,
      '# HELP nimbus_process_heap_used_bytes Heap in use',
      '# TYPE nimbus_process_heap_used_bytes gauge',
      `nimbus_process_heap_used_bytes ${memory.heapUsed}`,
      '# HELP nimbus_build_info Build information',
      '# TYPE nimbus_build_info gauge',
      `nimbus_build_info{env="${process.env.NODE_ENV ?? 'development'}",node="${process.version}"} 1`,
    ];

    res.setHeader('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return res.send(`${lines.join('\n')}\n`);
  }),
);

export default router;