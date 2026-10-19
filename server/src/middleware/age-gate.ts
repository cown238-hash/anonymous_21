import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { resolveAgeCheck } from '../services/age-gate.js';

/** Code the client keys off to decide between "answer the gate" and "error". */
export const AGE_REQUIRED_CODE = 'AGE_VERIFICATION_REQUIRED';

/**
 * Blocks content routes until the visitor has confirmed they are old enough.
 *
 * Applied to the routers that serve reading material — posts, comments,
 * categories, tags, members, stats — rather than to the whole API. Sign-in,
 * health checks, telemetry and the sitemap have to stay reachable, or a
 * legitimate adult could never get far enough to answer the gate, and crawlers
 * would see a 403 on every URL.
 *
 * A no-op unless `AGE_GATE_ENABLED=true`, so development and the test suite are
 * unaffected by default.
 */
export async function requireAgeGate(req: Request, res: Response, next: NextFunction) {
  if (!env.AGE_GATE_ENABLED) return next();

  try {
    const status = await resolveAgeCheck(req, res);
    if (!status.verified) {
      return next(
        new HttpError(
          403,
          'กรุณายืนยันอายุก่อนเข้าใช้งาน',
          AGE_REQUIRED_CODE,
        ),
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}
