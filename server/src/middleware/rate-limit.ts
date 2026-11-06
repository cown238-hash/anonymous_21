import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../config/env.js';

function make(overrides: Partial<Options>) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Must mirror the Express `trust proxy` hop count, or the limiter buckets
    // requests by the outermost proxy's IP rather than the visitor's.
    ...(env.isProd ? { trustProxy: env.TRUST_PROXY_HOPS } : {}),
    ...overrides,
  });
}

export const globalLimiter = make({
  windowMs: 60_000,
  limit: 600,
  message: { success: false, error: { message: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่', code: 'TOO_MANY_REQUESTS' } },
});

export const authLimiter = make({
  windowMs: env.AUTH_LIMIT_WINDOW_MINUTES * 60_000,
  limit: env.AUTH_LIMIT_MAX,
  // Only failed attempts count. A user who signs in correctly, or registers,
  // never moves toward the threshold — otherwise a shared NAT address would
  // lock out everyone behind it.
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      message: `พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอ ${env.AUTH_LIMIT_WINDOW_MINUTES} นาที`,
      code: 'TOO_MANY_REQUESTS',
    },
  },
});

export const writeLimiter = make({
  windowMs: 60_000,
  limit: 60,
  message: {
    success: false,
    error: { message: 'เขียนบ่อยเกินไป กรุณารอสักครู่', code: 'TOO_MANY_REQUESTS' },
  },
});

export const uploadLimiter = make({
  windowMs: 60_000,
  limit: 30,
  message: {
    success: false,
    error: { message: 'อัปโหลดบ่อยเกินไป กรุณารอสักครู่', code: 'TOO_MANY_REQUESTS' },
  },
});

/** Chunks of one big upload arrive in bursts — keep the ceiling high but finite. */
export const chunkUploadLimiter = make({
  windowMs: 60_000,
  limit: 240,
  message: {
    success: false,
    error: { message: 'อัปโหลดบ่อยเกินไป กรุณารอสักครู่', code: 'TOO_MANY_REQUESTS' },
  },
});