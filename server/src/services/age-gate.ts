import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

/**
 * The age gate's server side.
 *
 * The confirmation is authoritative here, not in the browser: a visitor who
 * clears localStorage still has to answer, and one who hand-edits it gets
 * nothing, because the content routes themselves check the cookie against the
 * `AgeCheck` row before answering.
 */

export const AGE_COOKIE = 'wksl_age';

/**
 * `lax` rather than `none`: the gate cookie is first-party on every deployment
 * (the Vite dev server proxies `/api`, and production serves both from one
 * origin), so it never needs to travel on a cross-site request.
 */
export function ageCookieOptions() {
  return {
    httpOnly: true as const,
    secure: env.isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: env.AGE_GATE_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

/**
 * Keyed hash of the visitor's address.
 *
 * The address itself is never stored — only this digest, which cannot be
 * reversed without the key. `APP_ENCRYPTION_KEY` is the natural key; the
 * refresh secret stands in when it is unset, so a machine that never configured
 * encryption still gets a digests that are useless to anyone else.
 */
export function addressHash(req: Request): string | null {
  const address = req.ip ?? req.socket.remoteAddress ?? '';
  if (!address) return null;
  const key = process.env.APP_ENCRYPTION_KEY ?? env.JWT_REFRESH_SECRET;
  return crypto.createHmac('sha256', key).update(address).digest('hex');
}

export interface AgeStatus {
  verified: boolean;
  expiresAt: Date | null;
  /** How the decision was reached. Handy in tests and in the preflight output. */
  via: 'cookie' | 'address' | null;
}

const DENIED: AgeStatus = { verified: false, expiresAt: null, via: null };

/**
 * Looks up an existing confirmation for this request, restoring the cookie when
 * the visitor is recognised by address instead.
 *
 * A confirmation made under a different minimum age does not count: if the
 * threshold is ever raised, everyone answers again.
 */
export async function resolveAgeCheck(req: Request, res: Response): Promise<AgeStatus> {
  const now = new Date();

  const token = req.cookies?.[AGE_COOKIE];
  if (typeof token === 'string' && token.length > 0) {
    const found = await prisma.ageCheck.findUnique({
      where: { token },
      select: { expiresAt: true, minAge: true },
    });
    if (found && found.minAge === env.AGE_GATE_MIN_AGE && found.expiresAt > now) {
      return { verified: true, expiresAt: found.expiresAt, via: 'cookie' };
    }
    // Expired, unknown, or made under an older threshold: stop sending it.
    res.clearCookie(AGE_COOKIE, { path: '/' });
  }

  if (!env.AGE_GATE_IP_BINDING) return DENIED;

  const ipHash = addressHash(req);
  if (!ipHash) return DENIED;

  const sibling = await prisma.ageCheck.findFirst({
    where: { ipHash, minAge: env.AGE_GATE_MIN_AGE, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { token: true, expiresAt: true },
  });
  if (!sibling) return DENIED;

  // Same address, new browser (or cleared cookies): hand the confirmation over
  // rather than asking the same person to answer twice.
  res.cookie(AGE_COOKIE, sibling.token, ageCookieOptions());
  return { verified: true, expiresAt: sibling.expiresAt, via: 'address' };
}

/**
 * Records an accepted confirmation and sets its cookie.
 *
 * Only the verdict is written — the birth date has already been reduced to a
 * yes/no by the caller and is not passed in, so it cannot leak into the table.
 */
export async function grantAgeCheck(req: Request, res: Response): Promise<Date> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.AGE_GATE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.ageCheck.create({
    data: {
      token,
      minAge: env.AGE_GATE_MIN_AGE,
      ipHash: env.AGE_GATE_IP_BINDING ? addressHash(req) : null,
      userId: req.user?.id ?? null,
      expiresAt,
    },
  });

  res.cookie(AGE_COOKIE, token, ageCookieOptions());
  return expiresAt;
}
