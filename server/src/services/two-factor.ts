import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import { env } from '../config/env.js';

/**
 * Time-based one-time passwords (RFC 6238) via otplib, plus the otpauth://
 * provisioning URI and a QR code the user can scan.
 *
 * Recovery codes are stored as SHA-256 hashes: they are single-use secrets,
 * so a database leak must not reveal them.
 */

const RECOVERY_CODE_COUNT = 10;

/**
 * Number of 30-second steps accepted either side of "now".
 *
 * otplib defaults to `window: 0`, which means a code is only valid during the
 * exact 30-second step it was generated in. A user who reads a code at the end
 * of a window and types it just after the boundary is rejected, and so is a
 * client whose clock has drifted — both look like a wrong code to the person
 * holding the phone. The login route spends a few hundred milliseconds in
 * bcrypt before it reaches the 2FA check, which is enough to cross a boundary.
 *
 * RFC 6238 §5.2 recommends exactly this tolerance. `window: 1` widens the
 * usable life of a code from 30s to 90s, the trade every mainstream
 * authenticator deployment makes; repeated failures are still stopped by the
 * account lockout on the login route.
 */
const TOTP_WINDOW = 1;

/**
 * The window has to be set here rather than passed to `verify()`.
 *
 * otplib's `verify(opts)` reads only `opts.token` and `opts.secret`
 * (@otplib/core), so a `window` in the argument object is dropped without a
 * word. `allOptions()` merges the instance options over the library defaults,
 * which is the only place the window is read from.
 */
authenticator.options = { ...authenticator.options, window: TOTP_WINDOW };

export function generateTotpSecret(): string {
  return authenticator.generateSecret(32);
}

export function verifyTotp(secret: string, token: string): boolean {
  const cleaned = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    return authenticator.verify({ token: cleaned, secret });
  } catch {
    return false;
  }
}

/** The code this server would accept right now. Debug logging only. */
export function peekTotp(secret: string): string {
  try {
    return authenticator.generate(secret);
  } catch {
    return 'error';
  }
}

export function buildOtpAuthUri(secret: string, account: string): string {
  return authenticator.keyuri(account, env.TWO_FACTOR_ISSUER, secret);
}

/**
 * Renders the provisioning URI as an inline SVG QR code.
 *
 * Returned as a `data:` URI rather than raw markup so it can be dropped
 * straight into an `<img src>` with no extra request and no object-URL
 * cleanup to leak.
 */
export async function totpQrCodeDataUrl(secret: string, account: string): Promise<string> {
  const uri = buildOtpAuthUri(secret, account);
  const svg = await QRCode.toString(uri, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0d1222', light: '#ffffff' },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 10 chars, grouped for readability: XXXXX-XXXXX
    const raw = crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 10);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Consumes a recovery code if it matches and has not been used yet. */
export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const { prisma } = await import('../lib/prisma.js');

  const hashed = hashRecoveryCode(code);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorRecoveryHashes: true },
  });
  if (!user?.twoFactorRecoveryHashes.includes(hashed)) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorRecoveryHashes: user.twoFactorRecoveryHashes.filter((h) => h !== hashed) },
  });
  return true;
}

/** How many recovery codes are still unused. */
export async function remainingRecoveryCodes(userId: string): Promise<number> {
  const { prisma } = await import('../lib/prisma.js');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorRecoveryHashes: true },
  });
  return user?.twoFactorRecoveryHashes.length ?? 0;
}