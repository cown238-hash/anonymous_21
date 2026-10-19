import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { ageAt, isPlausible, parseBirthDate } from '../lib/age.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { ok } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rate-limit.js';
import { grantAgeCheck, resolveAgeCheck } from '../services/age-gate.js';

/**
 * The age gate.
 *
 * The client sends a birth date, the server decides, and the answer — not the
 * date — is what survives. The gate has no POST case for an underage visitor:
 * nothing is recorded, so a mistyped year can be corrected straight away.
 */
const router = Router();

/** GET /api/age-gate — does the gate run here, and has this visitor passed it? */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!env.AGE_GATE_ENABLED) {
      return ok(res, {
        enabled: false,
        verified: true,
        minAge: env.AGE_GATE_MIN_AGE,
        expiresAt: null,
      });
    }

    const status = await resolveAgeCheck(req, res);
    return ok(res, {
      enabled: true,
      verified: status.verified,
      minAge: env.AGE_GATE_MIN_AGE,
      expiresAt: status.expiresAt,
    });
  }),
);

/** POST /api/age-gate — check the birth date and remember an accepted answer. */
router.post(
  '/',
  writeLimiter,
  validateBody(
    z.object({
      birthDate: z
        .string()
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'วันเกิดต้องอยู่ในรูปแบบ YYYY-MM-DD'),
    }),
  ),
  asyncHandler(async (req, res) => {
    if (!env.AGE_GATE_ENABLED) {
      return ok(res, {
        enabled: false,
        verified: true,
        eligible: true,
        minAge: env.AGE_GATE_MIN_AGE,
        expiresAt: null,
      });
    }

    const { birthDate } = req.body as { birthDate: string };
    const parsed = parseBirthDate(birthDate);
    const now = new Date();

    // The birth date is checked here and then dropped. It is never written to
    // the database and never logged — only the yes/no below exists afterwards.
    if (!parsed || !isPlausible(parsed, now)) {
      throw HttpError.badRequest('วันเกิดไม่ถูกต้อง กรุณาตรวจสอบข้อมูลอีกครั้ง', [
        { field: 'birthDate', message: 'วันเกิดไม่ถูกต้อง' },
      ]);
    }

    const eligible = ageAt(parsed, now) >= env.AGE_GATE_MIN_AGE;
    if (!eligible) {
      return ok(res, {
        enabled: true,
        verified: false,
        eligible: false,
        minAge: env.AGE_GATE_MIN_AGE,
        expiresAt: null,
      });
    }

    const expiresAt = await grantAgeCheck(req, res);
    return ok(res, {
      enabled: true,
      verified: true,
      eligible: true,
      minAge: env.AGE_GATE_MIN_AGE,
      expiresAt,
    });
  }),
);

export default router;
