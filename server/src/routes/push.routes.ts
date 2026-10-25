import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler.js';
import { noContent, ok } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { env } from '../config/env.js';
import { pushEnabled, removeSubscription, saveSubscription } from '../services/push.js';

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url('endpoint ต้องเป็น URL').max(2048),
  keys: z.object({
    /// URL-safe base64: the ECDH public key (65 bytes) and auth secret.
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url('endpoint ต้องเป็น URL').max(2048),
});

/**
 * GET /api/push/public-key - the VAPID key the browser subscribes with.
 *
 * Answered before `requireAuth` so the client can decide whether to render
 * the toggle at all without a round-trip; the key itself is public by design.
 */
router.get('/public-key', (_req, res) =>
  ok(res, { enabled: pushEnabled(), publicKey: env.VAPID_PUBLIC_KEY ?? null }),
);

router.use(requireAuth);

/** POST /api/push/subscribe - store this browser's push subscription. */
router.post(
  '/subscribe',
  writeLimiter,
  validateBody(subscriptionSchema),
  asyncHandler(async (req, res) => {
    if (!pushEnabled()) return ok(res, { enabled: false });
    const body = req.body as z.infer<typeof subscriptionSchema>;
    await saveSubscription(req.user!.id, body, req.headers['user-agent']);
    return noContent(res);
  }),
);

/** POST /api/push/unsubscribe - drop one browser's subscription. */
router.post(
  '/unsubscribe',
  writeLimiter,
  validateBody(unsubscribeSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof unsubscribeSchema>;
    await removeSubscription(req.user!.id, body.endpoint);
    return noContent(res);
  }),
);

export default router;
