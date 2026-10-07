import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../config/logger.js';

/**
 * Failed-login throttling and an audit trail for sensitive actions.
 */

export interface LockState {
  locked: boolean;
  until: Date | null;
  remainingAttempts: number;
}

export async function getLockState(user: {
  failedLoginCount: number;
  lockedUntil: Date | null;
}): Promise<LockState> {
  const locked = Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  return {
    locked,
    until: locked ? user.lockedUntil : null,
    remainingAttempts: locked ? 0 : Math.max(0, env.LOGIN_MAX_ATTEMPTS - user.failedLoginCount),
  };
}

/** Records a failed attempt and locks the account once the threshold is hit. */
export async function registerFailedLogin(userId: string): Promise<LockState> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true, lockedUntil: true },
  });

  if (user.failedLoginCount >= env.LOGIN_MAX_ATTEMPTS) {
    const until = new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60 * 1000);
    await prisma.user.update({ where: { id: userId }, data: { lockedUntil: until } });
    logger.warn('account locked after repeated failures', { userId, until: until.toISOString() });
    return { locked: true, until, remainingAttempts: 0 };
  }

  return {
    locked: false,
    until: null,
    remainingAttempts: Math.max(0, env.LOGIN_MAX_ATTEMPTS - user.failedLoginCount),
  };
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
}

/** Best-effort audit write; never throws. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: input.metadata ?? undefined,
        ip: input.req?.ip ?? null,
        requestId: input.req?.requestId ?? null,
        actorId: input.req?.user?.id ?? null,
      },
    });
  } catch (err) {
    logger.error('audit write failed', { action: input.action, error: String(err) });
  }
}