import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Issues single-use opaque tokens (email verification, password reset).
 *
 * Tokens are 32 random bytes, handed to the user in plaintext exactly once,
 * and only their SHA-256 hash is persisted. A database leak therefore cannot
 * be replayed against a live account.
 */
export interface IssuedToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export function issueToken(ttlMs: number): IssuedToken {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs),
  };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const emailVerificationTtlMs = () => env.EMAIL_VERIFY_TTL_HOURS * 60 * 60 * 1000;
export const passwordResetTtlMs = () => env.PASSWORD_RESET_TTL_MINUTES * 60 * 1000;

/**
 * Constant-time comparison so a timing side channel cannot be used to guess a
 * token character by character.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * AES-256-GCM helper used for secrets that must not sit in plaintext in the
 * database (the TOTP shared secret). Falls back to plaintext when no key is
 * configured, which keeps local development friction-free.
 */
const ALGO = 'aes-256-gcm';

function masterKey(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = masterKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  if (!payload.startsWith('v1.')) return payload;

  const key = masterKey();
  if (!key) return payload;

  const [, ivB64, tagB64, dataB64] = payload.split('.');
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64!, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64!, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return payload;
  }
}