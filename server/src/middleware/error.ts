import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../lib/http-error.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(HttpError.notFound(`ไม่พบเส้นทาง ${req.method} ${req.originalUrl}`));
}

/** Maps well-known error shapes onto our response envelope. */
function normalize(err: unknown): { status: number; code: string; message: string; details?: unknown } | null {
  if (err instanceof HttpError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
      const field = Array.isArray(target) ? target.join(', ') : String(target);
      return { status: 409, code: 'CONFLICT', message: `ค่านี้ถูกใช้ไปแล้ว (${field})` };
    }
    if (err.code === 'P2025') {
      return { status: 404, code: 'NOT_FOUND', message: 'ไม่พบข้อมูลที่ต้องการ' };
    }
    if (err.code === 'P2003') {
      return { status: 400, code: 'BAD_REQUEST', message: 'ข้อมูลอ้างอิงไม่ถูกต้อง' };
    }
    if (err.code === 'P2034') {
      return {
        status: 409,
        code: 'CONFLICT',
        message: 'มีการเขียนข้อมูลพร้อมกัน กรุณาลองใหม่',
      };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: 'โครงสร้างข้อมูลไม่ถูกต้อง กรุณารัน prisma generate',
    };
  }

  // Body-parser rejects malformed JSON with a SyntaxError carrying a status.
  if (err instanceof SyntaxError && 'body' in err) {
    return { status: 400, code: 'BAD_REQUEST', message: 'รูปแบบ JSON ไม่ถูกต้อง' };
  }
  if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'ข้อมูลที่ส่งใหญ่เกินไป' };
  }

  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  const known = normalize(err);

  if (known) {
    // 5xx is our fault; everything else is the caller's.
    const level = known.status >= 500 ? 'error' : 'warn';
    logger[level]('request error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: known.status,
      code: known.code,
      userId: req.user?.id,
    });

    return res.status(known.status).json({
      success: false,
      error: {
        message: known.message,
        code: known.code,
        ...(known.details !== undefined ? { details: known.details } : {}),
        requestId: req.requestId,
      },
    });
  }

  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('unhandled error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    userId: req.user?.id,
    error: error.message,
    stack: error.stack,
  });

  return res.status(500).json({
    success: false,
    error: {
      message: env.isProd ? 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' : error.message,
      code: 'INTERNAL_ERROR',
      // The request id is how a user can quote the failure in a bug report.
      requestId: req.requestId,
    },
  });
}