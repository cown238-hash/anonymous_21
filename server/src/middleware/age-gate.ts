import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
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
 * Reads the enabled flag from the `SystemSetting` table first (so admins can
 * toggle it without restarting), falling back to `AGE_GATE_ENABLED` env var
 * when no row exists yet.
 */
export async function requireAgeGate(req: Request, res: Response, next: NextFunction) {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'age_gate_enabled' } });
  const enabled = setting ? setting.value === 'true' : env.AGE_GATE_ENABLED;
  if (!enabled) return next();

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
