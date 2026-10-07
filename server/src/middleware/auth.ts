import type { NextFunction, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { HttpError } from '../lib/http-error.js';
import { verifyAccessToken } from '../lib/tokens.js';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  displayName: string;
  avatarUrl: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

async function resolveUser(token: string): Promise<AuthUser | null> {
  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, displayName: true, avatarUrl: true, isBanned: true },
    });
    if (!user || user.isBanned) return null;
    return user;
  } catch {
    return null;
  }
}

/** Attaches req.user when a valid token is present, but never rejects. */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (token) {
    const user = await resolveUser(token);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(HttpError.unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(HttpError.unauthorized());
  if (req.user.role !== Role.ADMIN) return next(HttpError.forbidden('เฉพาะผู้ดูแลระบบเท่านั้น'));
  next();
}

export function requireSelfOrAdmin(paramName = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(HttpError.unauthorized());
    const target = req.params[paramName];
    if (target !== req.user.id && req.user.role !== Role.ADMIN) {
      return next(HttpError.forbidden());
    }
    next();
  };
}