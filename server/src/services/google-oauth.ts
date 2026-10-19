import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { HttpError } from '../lib/http-error.js';

/**
 * Google sign-in (OAuth 2.0 authorization code + PKCE).
 *
 * Two redirects, no JavaScript library:
 *
 *   browser → /auth/google/start → accounts.google.com → /auth/google/callback
 *
 * The client secret never leaves the server, so PKCE is not strictly required
 * — but it binds the code to the browser that started the flow, which means a
 * code lifted out of the redirect cannot be redeemed from somewhere else.
 *
 * Nothing here runs unless both credentials are configured; every entry point
 * checks `googleConfigured()` first.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/** Google's own clock gave us 10 s to answer before; keep the same patience. */
const REQUEST_TIMEOUT_MS = 10_000;

/** How long the browser may stay on Google's consent screen. */
export const GOOGLE_FLOW_TTL_MS = 10 * 60 * 1000;

export interface GoogleProfile {
  /** Google's stable subject id. Never reused, unlike an email address. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/** The exact address that must be whitelisted in the Google console. */
export function googleRedirectUri(): string {
  return env.GOOGLE_OAUTH_REDIRECT ?? `${env.PUBLIC_URL}/api/auth/google/callback`;
}

/** A random `state`; compared against the cookie on the way back. */
export function newState(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/** PKCE verifier plus the S256 challenge derived from it. */
export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function googleAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID as string,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Always ask, so a shared computer cannot silently reuse the last account.
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Trades the one-time code for an access token.
 *
 * The `id_token` is deliberately ignored: it would have to be signature-checked
 * against Google's rotating keys, while the userinfo call below already travels
 * over TLS straight from us to Google and is therefore just as trustworthy.
 */
export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<string> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID as string,
    client_secret: env.GOOGLE_CLIENT_SECRET as string,
    redirect_uri: googleRedirectUri(),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });

  const res = await fetchJson(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
  });

  const accessToken = (res as { access_token?: unknown }).access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    logger.warn('google token exchange returned no access token', {
      keys: Object.keys(res as Record<string, unknown>),
    });
    throw new HttpError(502, 'เชื่อมต่อกับ Google ไม่สำเร็จ กรุณาลองใหม่', 'OAUTH_EXCHANGE_FAILED');
  }
  return accessToken;
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const data = (await fetchJson(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  })) as {
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
    picture?: unknown;
  };

  const sub = typeof data.sub === 'string' ? data.sub : null;
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : null;
  if (!sub || !email) {
    logger.warn('google userinfo missing sub/email');
    throw new HttpError(502, 'อ่านข้อมูลบัญชี Google ไม่สำเร็จ', 'OAUTH_PROFILE_INCOMPLETE');
  }

  return {
    sub,
    email,
    // Older accounts and some Workspace domains omit this; treat "missing" as
    // unverified so we never auto-link an address Google will not vouch for.
    emailVerified: data.email_verified === true,
    name: typeof data.name === 'string' ? data.name.trim().slice(0, 60) || null : null,
    picture: typeof data.picture === 'string' ? data.picture : null,
  };
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    logger.warn('google request failed', { url, error: (err as Error).message });
    throw new HttpError(504, 'ติดต่อ Google ไม่ได้ในขณะนี้ กรุณาลองใหม่', 'OAUTH_UNREACHABLE');
  }

  const text = await res.text();
  if (!res.ok) {
    // Google puts the reason in the body (`error`, `error_description`); it is
    // safe to log (no tokens) and useful when a redirect URI is not registered.
    logger.warn('google request rejected', {
      url,
      status: res.status,
      body: text.slice(0, 400),
    });
    throw new HttpError(502, 'Google ปฏิเสธคำขอ กรุณาลองใหม่', 'OAUTH_REJECTED');
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(502, 'Google ตอบกลับในรูปแบบที่ไม่รู้จัก', 'OAUTH_BAD_RESPONSE');
  }
}
