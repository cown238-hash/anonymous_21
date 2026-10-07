import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { noContent, ok } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { decryptSecret, encryptSecret } from '../services/tokens.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  remainingRecoveryCodes,
  totpQrCodeDataUrl,
  verifyTotp,
} from '../services/two-factor.js';
import { sendSecurityAlert } from '../services/mailer.js';
import { audit } from '../services/account-security.js';
import { logger } from '../config/logger.js';

const router = Router();

router.use(requireAuth);

const accountLabel = (email: string) => email;

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, email: true, twoFactorEnabled: true },
    });
    return ok(res, {
      enabled: user.twoFactorEnabled,
      recoveryCodesRemaining: user.twoFactorEnabled ? await remainingRecoveryCodes(user.id) : 0,
    });
  }),
);

/**
 * POST /api/auth/2fa/setup
 * Creates a pending secret and returns the QR code. 2FA is only switched on
 * once the user proves they can generate a valid code (see /confirm).
 */
router.post(
  '/setup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, email: true, twoFactorEnabled: true },
    });
    if (user.twoFactorEnabled) throw HttpError.conflict('เปิด 2FA ไว้แล้ว');

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: encryptSecret(secret) },
    });

    const qr = await totpQrCodeDataUrl(secret, accountLabel(user.email));

    return ok(res, {
      secret,
      qr,
      otpauthUrl: `otpauth://totp/${encodeURIComponent('WKSL')}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=WKSL`,
    });
  }),
);

/** POST /api/auth/2fa/confirm - verifies the first code and enables 2FA. */
router.post(
  '/confirm',
  authLimiter,
  validateBody(z.object({ code: z.string().trim().min(6, 'กรุณากรอกรหัส 6 หลัก') })),
  asyncHandler(async (req, res) => {
    const { code } = req.body as { code: string };

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, email: true, twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (user.twoFactorEnabled) throw HttpError.conflict('เปิด 2FA ไว้แล้ว');
    if (!user.twoFactorSecret) throw HttpError.badRequest('กรุณาขอ QR code ก่อน');

    const secret = decryptSecret(user.twoFactorSecret);
    if (!verifyTotp(secret, code)) throw HttpError.badRequest('รหัสยืนยันไม่ถูกต้อง');

    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryHashes: recoveryCodes.map(hashRecoveryCode),
      },
    });

    void sendSecurityAlert(user.email, 'เปิดใช้งาน 2FA', `เวลา ${new Date().toISOString()}`);
    await audit({ action: 'user.2fa_enable', targetType: 'user', targetId: user.id, req });

    // Shown exactly once — only the hashes are stored.
    return ok(res, { enabled: true, recoveryCodes });
  }),
);

/** POST /api/auth/2fa/disable */
router.post(
  '/disable',
  authLimiter,
  validateBody(z.object({ password: z.string().min(1, 'กรุณายืนยันรหัสผ่าน') })),
  asyncHandler(async (req, res) => {
    const { password } = req.body as { password: string };
    const bcrypt = (await import('bcryptjs')).default;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw HttpError.badRequest('รหัสผ่านไม่ถูกต้อง');

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryHashes: [] },
    });

    logger.info('2fa disabled', { userId: user.id, requestId: req.requestId });
    void sendSecurityAlert(user.email, 'ปิดใช้งาน 2FA', `เวลา ${new Date().toISOString()}`);
    await audit({ action: 'user.2fa_disable', targetType: 'user', targetId: user.id, req });

    return ok(res, { enabled: false });
  }),
);

/** POST /api/auth/2fa/recovery-codes - rotate recovery codes. */
router.post(
  '/recovery-codes',
  authLimiter,
  validateBody(z.object({ code: z.string().trim().min(6, 'กรุณากรอกรหัสยืนยันจากแอป 2FA') })),
  asyncHandler(async (req, res) => {
    const { code } = req.body as { code: string };
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.id },
      select: { id: true, email: true, twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw HttpError.badRequest('ยังไม่ได้เปิด 2FA');
    }
    if (!verifyTotp(decryptSecret(user.twoFactorSecret), code)) {
      throw HttpError.badRequest('รหัสยืนยันไม่ถูกต้อง');
    }

    const recoveryCodes = generateRecoveryCodes();
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryHashes: recoveryCodes.map(hashRecoveryCode) },
    });

    await audit({ action: 'user.2fa_recovery_codes', targetType: 'user', targetId: user.id, req });
    return ok(res, { recoveryCodes });
  }),
);

export default router;