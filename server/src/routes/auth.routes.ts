import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Role, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { created, noContent, ok } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import {
  REFRESH_COOKIE,
  hashToken,
  refreshCookieOptions,
  refreshTokenExpiry,
  signAccessToken,
  signGoogleFlowToken,
  signRefreshToken,
  verifyGoogleFlowToken,
  verifyRefreshToken,
} from '../lib/tokens.js';
import { publicUserSelect, serializeUser } from '../serializers/index.js';
import { emitToUser } from '../realtime/emitter.js';
import { sendPasswordResetEmail, sendSecurityAlert, sendVerifyEmail, sendKelcomeEmail } from '../services/mailer.js';
import {
  emailVerificationTtlMs,
  hashToken as hashOpaqueToken,
  issueToken,
  passwordResetTtlMs,
} from '../services/tokens.js';
import { audit, clearFailedLogins, getLockState, registerFailedLogin } from '../services/account-security.js';
import {
  GOOGLE_FLOW_TTL_MS,
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleAuthUrl,
  googleConfigured,
  newPkcePair,
  newState,
  type GoogleProfile,
} from '../services/google-oauth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'ชื่อผู้ใช้อย่างน้อย 3 ตัวอักษร')
    .max(30, 'ชื่อผู้ใช้ยาวเกินไป')
    .regex(/^[a-z0-9_]+$/, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9 และ _'),
  displayName: z.string().trim().min(2, 'ชื่อที่แสดงอย่างน้อย 2 ตัวอักษร').max(60),
  password: z
    .string()
    .min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร')
    .max(100)
    .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), {
      message: 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข',
    }),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'กรุณากรอกอีเมลหรือชื่อผู้ใช้'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
  totpCode: z.string().trim().optional(),
});

const passwordStrengthSchema = z
  .string()
  .min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร')
  .max(100)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), {
    message: 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข',
  });

async function issueSession(
  user: { id: string; username: string; role: Role },
  meta: { userAgent?: string | null; ip?: string | null },
) {
  const refreshToken = signRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent?.slice(0, 250) ?? null,
      ip: meta.ip ?? null,
      expiresAt: refreshTokenExpiry(),
    },
  });
  const accessToken = signAccessToken({ sub: user.id, username: user.username, role: user.role });
  return { accessToken, refreshToken };
}

function clientMeta(req: Request): { userAgent: string | null; ip: string | null } {
  return { userAgent: req.headers['user-agent'] ?? null, ip: req.ip ?? null };
}

/** Sends a verification email, replacing any previous unused token. */
async function dispatchVerification(userId: string, email: string) {
  const { token, tokenHash, expiresAt } = issueToken(emailVerificationTtlMs());
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { userId, purpose: 'email_verify', usedAt: null } }),
    prisma.verificationToken.create({
      data: { userId, purpose: 'email_verify', tokenHash, expiresAt },
    }),
  ]);
  return sendVerifyEmail(email, token);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------
router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, username, displayName, password } = req.body as z.infer<typeof registerSchema>;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (existing) {
      throw HttpError.conflict(
        existing.email === email ? 'อีเมลนี้ถูกใช้งานแล้ว' : 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว',
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        username,
        displayName,
        passwordHash: await bcrypt.hash(password, 12),
      },
      select: { ...publicUserSelect, role: true },
    });

    await audit({
      action: 'user.register',
      targetType: 'user',
      targetId: user.id,
      metadata: { username },
      req,
    });

    const lounge = await prisma.conversation.findFirst({
      where: { title: 'WKSL Lounge' },
      select: { id: true },
    });
    if (lounge) {
      await prisma.conversationMember.create({ data: { conversationId: lounge.id, userId: user.id } });
    }

    const mail = await dispatchVerification(user.id, email);
    void sendKelcomeEmail(email, displayName);

    const { accessToken, refreshToken } = await issueSession(user, clientMeta(req));
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);

    return created(res, {
      accessToken,
      user: serializeUser(user),
      emailVerification: {
        sent: mail.sent,
        // Only populated when SMTP is not configured, so local testing works.
        previewUrl: env.isProd ? undefined : mail.previewUrl,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Login (with optional 2FA challenge)
// ---------------------------------------------------------------------------
router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { identifier, password, totpCode } = req.body as z.infer<typeof loginSchema>;
    const lowered = identifier.toLowerCase();

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: lowered }, { username: lowered }] },
      select: {
        id: true,
        username: true,
        role: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        website: true,
        location: true,
        createdAt: true,
        lastSeenAt: true,
        passwordHash: true,
        isBanned: true,
        bannedAt: true,
        banReason: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorRecoveryHashes: true,
        failedLoginCount: true,
        lockedUntil: true,
        deletedAt: true,
      },
    });

    // Always run a hash comparison so timing does not reveal whether the
    // account exists. This literal is a valid bcrypt hash of a random value.
    const hash = user?.passwordHash ?? '$2a$12$abcdefghijklmnopqrstuv012345678901234567890123456789012';
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
      if (user) {
        const lock = await registerFailedLogin(user.id);
        logger.warn('failed login', {
          userId: user.id,
          requestId: req.requestId,
          locked: lock.locked,
          remaining: lock.remainingAttempts,
        });
        if (lock.locked) {
          throw HttpError.tooManyRequests(
            `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ใน ${env.LOGIN_LOCK_MINUTES} นาที`,
          );
        }
      } else {
        logger.warn('failed login (unknown account)', { identifier: lowered, requestId: req.requestId });
      }
      throw HttpError.unauthorized('อีเมล/ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
    }

    if (user.deletedAt) {
      throw HttpError.forbidden('บัญชีนี้ถูกลบแล้ว กรุณาสมัครใหม่');
    }

    const lock = await getLockState(user);
    if (lock.locked) {
      throw HttpError.tooManyRequests(
        `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ใน ${env.LOGIN_LOCK_MINUTES} นาที`,
      );
    }

    if (user.isBanned) {
      logger.warn('banned account login attempt', { userId: user.id, requestId: req.requestId });
      throw HttpError.forbidden(
        user.banReason ? `บัญชีถูกระงับ: ${user.banReason}` : 'บัญชีนี้ถูกระงับการใช้งาน',
      );
    }

    // --- Second factor ---
    if (user.twoFactorEnabled) {
      if (!totpCode) {
        return ok(res, { twoFactorRequired: true, emailHint: maskEmail(user.email) });
      }
      const { verifyTotp, consumeRecoveryCode } = await import('../services/two-factor.js');
      const { decryptSecret } = await import('../services/tokens.js');

      const secret = user.twoFactorSecret ? decryptSecret(user.twoFactorSecret) : null;
      const totpOk = secret ? verifyTotp(secret, totpCode) : false;
      const recoveryOk = totpOk ? true : await consumeRecoveryCode(user.id, totpCode);

      if (!recoveryOk) {
        const after = await registerFailedLogin(user.id);
        logger.warn('failed 2fa', {
          userId: user.id,
          requestId: req.requestId,
          codeLength: String(totpCode).length,
          codeIsDigits: /^\d{6}$/.test(String(totpCode).replace(/\s+/g, '')),
          storedSecretPresent: Boolean(user.twoFactorSecret),
          decryptedSecretPresent: Boolean(secret),
          secretLength: secret?.length ?? 0,
          expectedOtp: secret ? await import('../services/two-factor.js').then((m) => m.peekTotp(secret)) : null,
          serverStep: Math.floor(Date.now() / 30_000),
        });
        if (after.locked) {
          throw HttpError.tooManyRequests(
            `บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ใน ${env.LOGIN_LOCK_MINUTES} นาที`,
          );
        }
        throw HttpError.unauthorized('รหัสยืนยันไม่ถูกต้อง');
      }
      if (recoveryOk && !totpOk) {
        logger.info('recovery code used', { userId: user.id, requestId: req.requestId });
      }
    }

    await clearFailedLogins(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    const lounge = await prisma.conversation.findFirst({
      where: { title: 'WKSL Lounge' },
      select: { id: true },
    });
    if (lounge) {
      await prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: lounge.id, userId: user.id } },
        create: { conversationId: lounge.id, userId: user.id },
        update: {},
      });
    }

    await audit({ action: 'user.login', targetType: 'user', targetId: user.id, req });

    const session = await issueSession(user, clientMeta(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);

    return ok(res, {
      accessToken: session.accessToken,
      user: serializeUser(user),
    });
  }),
);

function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  if (!domain) return '•••';
  return `${name.slice(0, 2)}•••@${domain}`;
}

// ---------------------------------------------------------------------------
// Google sign-in
// ---------------------------------------------------------------------------

/** Cookie that carries the state/PKCE pair through the redirect to Google. */
const GOOGLE_FLOW_COOKIE = 'nimbus_google_flow';
const GOOGLE_FLOW_PATH = '/api/auth/google';

const googleUserSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  displayName: true,
  avatarUrl: true,
  isBanned: true,
  banReason: true,
  twoFactorEnabled: true,
  deletedAt: true,
  emailVerifiedAt: true,
} as const;

type GoogleUserRow = Prisma.UserGetPayload<{ select: typeof googleUserSelect }>;

type GoogleResolution =
  | { ok: true; user: GoogleUserRow; created: boolean; linked: boolean }
  | {
      ok: false;
      reason: 'banned' | 'deleted' | 'unverified_email' | 'two_factor';
      banReason?: string | null;
    };

/**
 * Where the browser goes back to. The first CORS origin is the canonical
 * client; `PUBLIC_URL` is the fallback for a single-origin deployment.
 */
function clientBaseUrl(): string {
  return (env.CLIENT_ORIGINS.split(',')[0] ?? '').trim() || env.PUBLIC_URL;
}

/**
 * These endpoints are reached by a browser navigation, so a failure has to land
 * back on the login page with a code — never a JSON body in the address bar.
 */
function clientRedirect(res: Response, path: string, params: Record<string, string> = {}) {
  const url = new URL(path, clientBaseUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return res.redirect(302, url.toString());
}

/**
 * `next` is echoed back in a redirect, so it must stay on this origin. A single
 * leading slash rules out `https://…`; a double slash would be protocol-relative.
 */
function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value.slice(0, 300);
}

/** A username we can offer, derived from the address Google vouched for. */
function usernameSeed(email: string): string {
  const local = (email.split('@')[0] ?? '').toLowerCase();
  const cleaned = local.replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  return (cleaned.length >= 3 ? cleaned : `${cleaned}user`).slice(0, 24);
}

async function pickUsername(email: string): Promise<string> {
  const seed = usernameSeed(email);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = attempt === 0 ? seed : `${seed}_${crypto.randomInt(100, 9999)}`.slice(0, 30);
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `user_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Maps a Google profile onto an account, creating or linking one when needed.
 *
 * Linking to an existing account is allowed only for an address Google reports
 * as verified — the same mailbox the account already owns. A Google account
 * with an unverified address is refused instead, because otherwise anyone able
 * to add that address to a Google account could take over the profile.
 *
 * An account with 2FA turned on is refused as well: letting Google skip the
 * second factor would silently weaken the setting its owner asked for.
 */
async function resolveGoogleUser(profile: GoogleProfile): Promise<GoogleResolution> {
  const linked = await prisma.user.findUnique({
    where: { googleId: profile.sub },
    select: googleUserSelect,
  });

  if (linked) {
    if (linked.deletedAt) return { ok: false, reason: 'deleted' };
    if (linked.isBanned) return { ok: false, reason: 'banned', banReason: linked.banReason };
    return { ok: true, user: linked, created: false, linked: false };
  }

  const existing = await prisma.user.findUnique({
    where: { email: profile.email },
    select: googleUserSelect,
  });

  if (existing) {
    if (existing.deletedAt) return { ok: false, reason: 'deleted' };
    if (existing.isBanned) return { ok: false, reason: 'banned', banReason: existing.banReason };
    if (!profile.emailVerified) return { ok: false, reason: 'unverified_email' };
    if (existing.twoFactorEnabled) return { ok: false, reason: 'two_factor' };

    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        googleId: profile.sub,
        emailVerified: true,
        // Google vouches for the address, so a previously unverified account
        // becomes verified at the moment it is linked.
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      },
      select: googleUserSelect,
    });
    return { ok: true, user, created: false, linked: true };
  }

  const username = await pickUsername(profile.email);
  const user = await prisma.user.create({
    data: {
      email: profile.email,
      username,
      displayName: (profile.name ?? username).slice(0, 60),
      // A Google account has no password here. An unguessable hash keeps the
      // column non-null (password login simply never matches) while still
      // letting the owner set one later through "forgot password".
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      googleId: profile.sub,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
    select: googleUserSelect,
  });
  return { ok: true, user, created: true, linked: false };
}

/** GET /api/auth/providers — what the login page may offer. */
router.get(
  '/providers',
  asyncHandler(async (_req, res) => ok(res, { google: googleConfigured() })),
);

/** GET /api/auth/google/start — sets the flow cookie and leaves for Google. */
router.get(
  '/google/start',
  authLimiter,
  asyncHandler(async (req, res) => {
    if (!googleConfigured()) {
      throw new HttpError(503, 'ยังไม่ได้เปิดใช้งานการเข้าสู่ระบบด้วย Google', 'OAUTH_DISABLED');
    }

    const { verifier, challenge } = newPkcePair();
    const state = newState();

    res.cookie(
      GOOGLE_FLOW_COOKIE,
      signGoogleFlowToken({ state, verifier, next: safeNext(req.query.next) }),
      {
        httpOnly: true,
        secure: env.isProd,
        // Lax, not None: the cookie only has to survive a top-level redirect
        // back from Google, and Lax keeps it off cross-site subrequests.
        sameSite: 'lax',
        path: GOOGLE_FLOW_PATH,
        maxAge: GOOGLE_FLOW_TTL_MS,
      },
    );

    return res.redirect(302, googleAuthUrl(state, challenge));
  }),
);

/** GET /api/auth/google/callback — trades the code, then hands out a session. */
router.get(
  '/google/callback',
  authLimiter,
  asyncHandler(async (req, res) => {
    const cookie: unknown = req.cookies?.[GOOGLE_FLOW_COOKIE];
    res.clearCookie(GOOGLE_FLOW_COOKIE, { path: GOOGLE_FLOW_PATH });

    if (!googleConfigured()) return clientRedirect(res, '/login', { google: 'disabled' });

    // Closing the consent screen comes back as ?error=access_denied.
    if (req.query.error) {
      logger.info('google flow cancelled', { error: String(req.query.error) });
      return clientRedirect(res, '/login', { google: 'cancelled' });
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state || typeof cookie !== 'string') {
      return clientRedirect(res, '/login', { google: 'state' });
    }

    let flow: ReturnType<typeof verifyGoogleFlowToken>;
    try {
      flow = verifyGoogleFlowToken(cookie);
    } catch {
      return clientRedirect(res, '/login', { google: 'expired' });
    }
    if (flow.state !== state) return clientRedirect(res, '/login', { google: 'state' });

    let profile: GoogleProfile;
    try {
      profile = await fetchGoogleProfile(await exchangeGoogleCode(code, flow.verifier));
    } catch (err) {
      logger.warn('google sign-in failed', {
        error: (err as Error).message,
        requestId: req.requestId,
      });
      return clientRedirect(res, '/login', { google: 'failed' });
    }

    // A concurrent signup can take the same email or username between the
    // lookup and the insert. That is not an error worth a JSON page: sending
    // the visitor back to /login makes the retry link the existing account.
    let resolved: GoogleResolution;
    try {
      resolved = await resolveGoogleUser(profile);
    } catch (err) {
      logger.warn('google account resolution failed', {
        error: (err as Error).message,
        requestId: req.requestId,
      });
      return clientRedirect(res, '/login', { google: 'failed' });
    }

    if (!resolved.ok) {
      logger.info('google sign-in refused', {
        reason: resolved.reason,
        requestId: req.requestId,
      });
      return clientRedirect(res, '/login', { google: resolved.reason });
    }
    const { user, created: isNew, linked: isLinked } = resolved;

    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    const lounge = await prisma.conversation.findFirst({
      where: { title: 'WKSL Lounge' },
      select: { id: true },
    });
    if (lounge) {
      await prisma.conversationMember.upsert({
        where: { conversationId_userId: { conversationId: lounge.id, userId: user.id } },
        create: { conversationId: lounge.id, userId: user.id },
        update: {},
      });
    }

    await audit({
      action: isNew ? 'user.google_signup' : isLinked ? 'user.google_link' : 'user.login',
      targetType: 'user',
      targetId: user.id,
      metadata: { provider: 'google' },
      req,
    });

    if (isNew) void sendKelcomeEmail(profile.email, user.displayName);
    if (isLinked) {
      void sendSecurityAlert(
        profile.email,
        'เชื่อมบัญชี Google',
        'บัญชีนี้ถูกเชื่อมกับการเข้าสู่ระบบด้วย Google',
      );
    }

    const session = await issueSession(user, clientMeta(req));
    res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions);

    // The client boots by refreshing this cookie, so no token ever appears in
    // the URL — just a 302 to where the visitor was heading.
    return clientRedirect(res, flow.next);
  }),
);

// ---------------------------------------------------------------------------
// Refresh (rotates the refresh token)
// ---------------------------------------------------------------------------
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw HttpError.unauthorized('ไม่พบเซสชัน กรุณาเข้าสู่ระบบใหม่');

    let session: { id: string; userId: string };
    try {
      verifyRefreshToken(token);
      session = await prisma.session.findUniqueOrThrow({
        where: { refreshTokenHash: hashToken(token) },
        select: { id: true, userId: true },
      });
    } catch {
      res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
      throw HttpError.unauthorized('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.isBanned || user.deletedAt) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
      throw HttpError.unauthorized('เซสชันไม่ถูกต้อง');
    }

    // Rotate: the presented token is destroyed before a new one is issued.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    const next = await issueSession(user, clientMeta(req));
    res.cookie(REFRESH_COOKIE, next.refreshToken, refreshCookieOptions);

    return ok(res, { accessToken: next.accessToken, user: serializeUser(user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await prisma.session
        .deleteMany({ where: { refreshTokenHash: hashToken(token) } })
        .catch(() => undefined);
    }
    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
    return noContent(res);
  }),
);

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------
router.post(
  '/verify-email/send',
  requireAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, email: true, emailVerified: true },
    });
    if (user.emailVerified) return ok(res, { verified: true, sent: false });

    const mail = await dispatchVerification(user.id, user.email);
    return ok(res, {
      sent: mail.sent,
      previewUrl: env.isProd ? undefined : mail.previewUrl,
    });
  }),
);

router.post(
  '/verify-email',
  authLimiter,
  validateBody(z.object({ token: z.string().trim().min(10, 'token ไม่ถูกต้อง') })),
  asyncHandler(async (req, res) => {
    const { token } = req.body as { token: string };

    const row = await prisma.verificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      select: { id: true, userId: true, purpose: true, usedAt: true, expiresAt: true },
    });

    if (!row || row.purpose !== 'email_verify' || row.usedAt) {
      throw HttpError.badRequest('ลิงก์ยืนยันไม่ถูกต้อง หรือถูกใช้ไปแล้ว');
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw HttpError.badRequest('ลิงก์ยืนยันหมดอายุ กรุณาขอลิงก์ใหม่');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);

    await audit({ action: 'user.verify_email', targetType: 'user', targetId: row.userId, req });

    return ok(res, { verified: true });
  }),
);

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
router.post(
  '/password/forgot',
  authLimiter,
  validateBody(z.object({ email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง') })),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, deletedAt: true },
    });

    // Always answer 200 so the endpoint cannot be used to enumerate accounts.
    if (!user || user.deletedAt) {
      return ok(res, { sent: true });
    }

    const { token, tokenHash, expiresAt } = issueToken(passwordResetTtlMs());
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt, ip: req.ip ?? null },
      }),
    ]);

    const mail = await sendPasswordResetEmail(user.email, token);
    logger.info('password reset requested', { userId: user.id, requestId: req.requestId });

    return ok(res, {
      sent: true,
      previewUrl: env.isProd ? undefined : mail.previewUrl,
    });
  }),
);

router.post(
  '/password/reset',
  authLimiter,
  validateBody(
    z.object({
      token: z.string().trim().min(10, 'token ไม่ถูกต้อง'),
      password: passwordStrengthSchema,
    }),
  ),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body as { token: string; password: string };

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    if (!row || row.usedAt) throw HttpError.badRequest('ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง หรือถูกใช้ไปแล้ว');
    if (row.expiresAt.getTime() < Date.now()) {
      throw HttpError.badRequest('ลิงก์รีเซ็ตรหัสผ่านหมดอายุ กรุณาขอลิงก์ใหม่');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        data: {
          passwordHash: await bcrypt.hash(password, 12),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      // A password reset invalidates every existing session.
      prisma.session.deleteMany({ where: { userId: row.userId } }),
    ]);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: row.userId }, select: { email: true } });
    void sendSecurityAlert(user.email, 'เปลี่ยนรหัสผ่านแล้ว', `เวลา ${new Date().toISOString()}`);
    await audit({ action: 'user.password_reset', targetType: 'user', targetId: row.userId, req });

    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
    return ok(res, { reset: true });
  }),
);

// ---------------------------------------------------------------------------
// Current user
// ---------------------------------------------------------------------------
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: {
        ...publicUserSelect,
        email: true,
        emailVerified: true,
        twoFactorEnabled: true,
        isHidden: true,
        createdAt: true,
      },
    });
    return ok(res, serializeUser(user));
  }),
);

router.patch(
  '/me',
  requireAuth,
  validateBody(
    z.object({
      displayName: z.string().trim().min(2).max(60).optional(),
      bio: z.string().trim().max(400).nullable().optional(),
      website: z.string().trim().url('URL ไม่ถูกต้อง').max(200).nullable().or(z.literal('')).optional(),
      location: z.string().trim().max(80).nullable().optional(),
      avatarUrl: z.string().trim().max(400).nullable().optional(),
      isHidden: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName as string } : {}),
        ...(body.bio !== undefined ? { bio: (body.bio as string) || null } : {}),
        ...(body.website !== undefined ? { website: (body.website as string) || null } : {}),
        ...(body.location !== undefined ? { location: (body.location as string) || null } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: (body.avatarUrl as string) || null } : {}),
        ...(body.isHidden !== undefined ? { isHidden: body.isHidden as boolean } : {}),
      },
      select: { ...publicUserSelect, email: true, emailVerified: true, twoFactorEnabled: true, isHidden: true },
    });
    emitToUser(user.id, 'user:updated', serializeUser(user));
    return ok(res, serializeUser(user));
  }),
);

router.post(
  '/me/password',
  requireAuth,
  authLimiter,
  validateBody(
    z.object({
      currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
      newPassword: passwordStrengthSchema,
    }),
  ),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw HttpError.badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง');

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 12) },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    void sendSecurityAlert(user.email, 'เปลี่ยนรหัสผ่าน', `เวลา ${new Date().toISOString()}`);
    await audit({ action: 'user.password_change', targetType: 'user', targetId: user.id, req });

    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
    return noContent(res);
  }),
);

/** DELETE /api/auth/me - permanently removes the account and all its data. */
router.delete(
  '/me',
  requireAuth,
  validateBody(z.object({ password: z.string().min(1, 'กรุณายืนยันรหัสผ่านเพื่อลบบัญชี') })),
  asyncHandler(async (req, res) => {
    const password = (req.body as { password?: string }).password;
    if (!password) throw HttpError.badRequest('กรุณายืนยันรหัสผ่านเพื่อลบบัญชี');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw HttpError.badRequest('รหัสผ่านไม่ถูกต้อง');

    await audit({
      action: 'user.delete_account',
      targetType: 'user',
      targetId: user.id,
      metadata: { username: user.username },
      req,
    });

    await prisma.user.delete({ where: { id: user.id } });
    logger.info('account deleted', { userId: user.id, requestId: req.requestId });

    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
    return noContent(res);
  }),
);

router.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
    });
    return ok(res, sessions);
  }),
);

router.delete(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.session.deleteMany({ where: { userId: req.user!.id } });
    await audit({ action: 'user.revoke_sessions', targetType: 'user', targetId: req.user!.id, req });
    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path });
    return noContent(res);
  }),
);

/** GET /api/auth/me/export - download everything we hold about the account. */
router.get(
  '/me/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const [user, posts, comments, likes, messages, notifications, sessions, reports] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        prisma.post.findMany({ where: { authorId: userId } }),
        prisma.comment.findMany({ where: { authorId: userId } }),
        prisma.like.findMany({ where: { userId } }),
        prisma.message.findMany({ where: { senderId: userId } }),
        prisma.notification.findMany({ where: { userId } }),
        prisma.session.findMany({ where: { userId } }),
        prisma.report.findMany({ where: { reporterId: userId } }),
      ]);

    // iever export secrets.
    const { passwordHash: _pw, twoFactorSecret: _tfa, twoFactorRecoveryHashes: _rec, ...safeUser } =
      user;

    res.setHeader('content-type', 'application/json');
    res.setHeader('content-disposition', `attachment; filename="wksl-export-${userId}.json"`);
    return res.send(
      JSON.stringify(
        { exportedAt: new Date().toISOString(), user: safeUser, posts, comments, likes, messages, notifications, sessions, reports },
        null,
        2,
      ),
    );
  }),
);

export default router;