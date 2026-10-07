import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wrap async route handlers so rejected promises reach the error middleware. */
export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}