import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const REFRESH_COOKIE = 'nimbus_rt';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(): string {
  return jwt.sign(
    // `jti` guarantees uniqueness: without it, two logins within the same
    // second produce byte-identical tokens and collide on the stored hash.
    { type: 'refresh', jti: crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` },
  );
}

export function verifyRefreshToken(token: string): jwt.JwtPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (typeof decoded === 'string' || decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return decoded;
}

/** Sessions are stored hashed so a DB leak cannot be replayed. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export const refreshCookieOptions = {
  httpOnly: true as const,
  secure: env.isProd,
  sameSite: env.isProd ? ('none' as const) : ('lax' as const),
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Google sign-in flow
// ---------------------------------------------------------------------------

/**
 * What the browser carries across the Google round-trip.
 *
 * `state` is the CSRF token, `verifier` is the PKCE secret, and `next` is where
 * to land afterwards. All three have to survive a redirect through a third
 * party, so they travel in one signed cookie rather than server-side state.
 */
export interface GoogleFlowPayload {
  state: string;
  verifier: string;
  next: string;
}

/**
 * A key of its own, derived from the access secret. Signing flow tokens with
 * the access-token secret directly would put two unrelated token types behind
 * one key; deriving keeps them separate without adding another env var.
 */
const googleFlowKey = crypto
  .createHmac('sha256', env.JWT_ACCESS_SECRET)
  .update('wksl:google-oauth-flow')
  .digest('hex');

export function signGoogleFlowToken(payload: GoogleFlowPayload): string {
  return jwt.sign({ type: 'google_flow', ...payload }, googleFlowKey, { expiresIn: '10m' });
}

export function verifyGoogleFlowToken(token: string): GoogleFlowPayload {
  const decoded = jwt.verify(token, googleFlowKey);
  if (typeof decoded === 'string' || decoded.type !== 'google_flow') {
    throw new Error('Invalid Google flow token');
  }
  const { state, verifier, next } = decoded as jwt.JwtPayload & Partial<GoogleFlowPayload>;
  if (typeof state !== 'string' || typeof verifier !== 'string' || typeof next !== 'string') {
    throw new Error('Invalid Google flow token');
  }
  return { state, verifier, next };
}