import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ok } from '../lib/http.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

void prisma;

const router = Router();

const ingestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  level: z.enum(['warn', 'error', 'fatal']).default('error'),
  context: z.string().trim().max(200).optional(),
  stack: z.string().trim().max(8000).optional(),
  url: z.string().trim().max(500).optional(),
  userAgent: z.string().trim().max(400).optional(),
  userId: z.string().trim().max(64).optional(),
  build: z.string().trim().max(64).optional(),
});

/**
 * POST /api/client-errors
 * Collects unhandled frontend errors. Without an ERROR_REPORT_ENDPOINT the
 * payload is only logged, which keeps local development self-contained.
 */
router.post(
  '/client-errors',
  asyncHandler(async (req, res) => {
    const report = ingestSchema.parse(req.body);

    const line = {
      source: 'client',
      level: report.level,
      message: report.message,
      context: report.context,
      url: report.url,
      userAgent: report.userAgent ?? req.headers['user-agent'] ?? null,
      userId: report.userId ?? req.user?.id,
      stack: report.stack,
      build: report.build,
      requestId: req.requestId,
      ip: req.ip,
    };

    if (env.ERROR_REPORT_ENDPOINT) {
      void fetch(env.ERROR_REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(line),
      }).catch((err) => logger.warn('error report forward failed', { error: String(err) }));
    } else {
      logger.error('client error', line);
    }

    // Always 202: the browser should never be blocked by reporting.
    return res.status(202).json({ success: true, data: { accepted: true } });
  }),
);

const analyticsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  url: z.string().trim().max(500).optional(),
  referrer: z.string().trim().max(500).optional(),
});

/**
 * POST /api/collect - privacy-friendly analytics sink.
 *
 * No cookies, no fingerprinting, no third-party script. The client posts an
 * event name and the server forwards it to ANALYTICS_ENDPOINT if configured.
 * IP is truncated to /24 so it is useful for rough geo without identifying.
 */
router.post(
  '/collect',
  asyncHandler(async (req, res) => {
    const event = analyticsSchema.parse(req.body);

    const payload = {
      name: event.name,
      props: event.props ?? {},
      path: event.url ?? req.originalUrl,
      referrer: event.referrer ?? req.headers.referer ?? null,
      // Coarse only.
      ip: req.ip ? req.ip.replace(/\.\d+$/, '.0') : null,
      ua: req.headers['user-agent'] ?? null,
      at: new Date().toISOString(),
    };

    if (env.ANALYTICS_ENDPOINT) {
      void fetch(env.ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => logger.warn('analytics forward failed', { error: String(err) }));
    }

    return res.status(202).json({ success: true, data: { accepted: true } });
  }),
);

/** GET /api/collect/config - tells the client whether to send events at all. */
router.get(
  '/collect/config',
  asyncHandler(async (_req, res) => {
    return ok(res, { enabled: Boolean(env.ANALYTICS_ENDPOINT), appVersion: '1.0.0' });
  }),
);

export default router;