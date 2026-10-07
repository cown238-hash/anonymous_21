import type { Response } from 'express';
import { HttpError } from './http-error.js';

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export function paginate<T>(items: T[], total: number, page: number, perPage: number): Paginated<T> {
  return {
    items,
    meta: {
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, 201);
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function assertFound<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) throw HttpError.notFound(message);
  return value;
}

export function assertCondition(condition: unknown, error: HttpError): asserts condition {
  if (!condition) throw error;
}