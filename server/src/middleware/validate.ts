import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { HttpError } from '../lib/http-error.js';

export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(zodToHttpError(result.error));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(zodToHttpError(result.error));
    }
    // req.query is a getter-only property on Express 5; stash parsed values.
    (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
    next();
  };
}

export function getQuery<T>(req: Request): T {
  return ((req as Request & { validatedQuery?: unknown }).validatedQuery ?? req.query) as T;
}

export function zodToHttpError(error: ZodError): HttpError {
  const details = error.issues.map((i) => ({
    field: i.path.join('.') || '_root',
    message: i.message,
  }));
  const first = details[0];
  return HttpError.badRequest(first ? `${first.field}: ${first.message}` : 'ข้อมูลไม่ถูกต้อง', details);
}