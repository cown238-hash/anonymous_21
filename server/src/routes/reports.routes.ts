import { Router } from 'express';
import { ReportReason, ReportStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, ok, paginate } from '../lib/http.js';
import { validateBody, validateQuery, getQuery } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';
import { removeUpload } from '../middleware/upload.js';
import { audit } from '../services/account-security.js';

const router = Router();

const createSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string().trim().min(1, 'ไม่พบเป้าหมาย'),
  reason: z.nativeEnum(ReportReason),
  detail: z.string().trim().max(1000).optional(),
});

/** POST /api/reports - flag content for moderator review. */
router.post(
  '/',
  requireAuth,
  writeLimiter,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;

    const exists =
      body.targetType === 'post'
        ? await prisma.post.findUnique({ where: { id: body.targetId }, select: { id: true } })
        : await prisma.comment.findUnique({ where: { id: body.targetId }, select: { id: true } });
    if (!exists) throw HttpError.notFound('ไม่พบเนื้อหาที่ต้องการรายงาน');

    // One open report per user per target.
    const duplicate = await prisma.report.findFirst({
      where: {
        reporterId: req.user!.id,
        targetType: body.targetType,
        targetId: body.targetId,
        status: { in: [ReportStatus.OPEN, ReportStatus.REVIEWING] },
      },
      select: { id: true },
    });
    if (duplicate) throw HttpError.conflict('คุณรายงานเนื้อหานี้ไปแล้ว');

    const report = await prisma.report.create({
      data: {
        reporterId: req.user!.id,
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        detail: body.detail ?? null,
      },
    });

    await audit({
      action: 'report.create',
      targetType: 'report',
      targetId: report.id,
      metadata: { targetType: body.targetType, targetId: body.targetId, reason: body.reason },
      req,
    });

    return created(res, { id: report.id, status: report.status });
  }),
);

/** GET /api/reports/mine */
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const reports = await prisma.report.findMany({
      where: { reporterId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, targetType: true, targetId: true, reason: true, status: true, createdAt: true },
    });
    return ok(res, reports);
  }),
);

// ---------------------------------------------------------------------------
// Moderation (admin only)
// ---------------------------------------------------------------------------
router.get(
  '/admin/queue',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN') throw HttpError.forbidden('เฉพาะผู้ดูแลระบบเท่านั้น');

    const q = getQuery<{ page: string; perPage: string; status: string }>(req);
    const page = Math.max(1, Number(q.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(q.perPage ?? 20)));
    const status = (q.status as ReportStatus | undefined) ?? undefined;

    const where = status ? { status } : {};
    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { reporter: { select: publicUserSelect } },
      }),
    ]);

    // Resolve a human-readable snippet of the reported content.
    const items = await Promise.all(
      reports.map(async (r) => {
        let snippet: string | null = null;
        let author: string | null = null;
        let url: string | null = null;

        if (r.targetType === 'post') {
          const post = await prisma.post.findUnique({
            where: { id: r.targetId },
            select: { title: true, excerpt: true, slug: true, status: true, author: { select: { displayName: true } } },
          });
          snippet = post ? `${post.title}${post.excerpt ? ` — ${post.excerpt}` : ''}` : '(ถูกลบแล้ว)';
          author = post?.author.displayName ?? null;
          url = post ? `/posts/${post.slug}` : null;
        } else {
          const comment = await prisma.comment.findUnique({
            where: { id: r.targetId },
            select: { content: true, isDeleted: true, author: { select: { displayName: true } } },
          });
          snippet = comment ? comment.content : '(ถูกลบแล้ว)';
          author = comment?.author.displayName ?? null;
        }

        return {
          id: r.id,
          reason: r.reason,
          detail: r.detail,
          status: r.status,
          targetType: r.targetType,
          targetId: r.targetId,
          snippet,
          contentAuthor: author,
          url,
          reporter: serializeUser(r.reporter),
          createdAt: r.createdAt,
        };
      }),
    );

    return ok(res, paginate(items, total, page, perPage));
  }),
);

router.patch(
  '/admin/:id',
  requireAuth,
  validateBody(
    z.object({
      status: z.nativeEnum(ReportStatus),
      resolution: z.string().trim().max(500).optional(),
      removeContent: z.boolean().default(false),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'ADMIN') throw HttpError.forbidden('เฉพาะผู้ดูแลระบบเท่านั้น');
    const body = req.body as { status: ReportStatus; resolution?: string; removeContent: boolean };

    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw HttpError.notFound('ไม่พบรายงาน');

    if (body.removeContent) {
      if (report.targetType === 'post') {
        const post = await prisma.post.findUnique({ where: { id: report.targetId }, select: { coverImage: true } });
        await prisma.post.deleteMany({ where: { id: report.targetId } });
        removeUpload(post?.coverImage);
      } else {
        await prisma.comment.deleteMany({ where: { id: report.targetId } });
      }
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        status: body.status,
        resolution: body.resolution ?? null,
        resolvedBy: body.status === ReportStatus.OPEN ? null : req.user!.id,
      },
    });

    await audit({
      action: 'report.resolve',
      targetType: 'report',
      targetId: report.id,
      metadata: { status: body.status, removeContent: body.removeContent },
      req,
    });

    return ok(res, updated);
  }),
);

export default router;