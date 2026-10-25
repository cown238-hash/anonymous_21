/**
 * Resets the password of an existing account directly in the database.
 *
 *   node server/scripts/reset-password.mjs <username-or-email> [new-password]
 *
 * Generates a random password when none is given, then verifies the account
 * can actually sign in through the API before printing the credentials.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const identifier = process.argv[2];
if (!identifier) {
  console.error('usage: node server/scripts/reset-password.mjs <username-or-email> [new-password]');
  process.exit(1);
}

const lowered = identifier.toLowerCase();
const password = process.argv[3] || crypto.randomBytes(18).toString('base64url');

const prisma = new PrismaClient();
try {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: lowered }, { username: lowered }] },
    select: { id: true, username: true, email: true, role: true, isBanned: true, deletedAt: true },
  });
  if (!user) {
    console.error(`✗ ไม่พบบัญชี "${identifier}"`);
    process.exit(1);
  }
  if (user.deletedAt) {
    console.error(`✗ บัญชี ${user.username} ถูกลบไปแล้ว`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  console.log(`✓ reset password ของ ${user.username} (${user.email}, role=${user.role})`);
  console.log(`\n    ${user.username} / ${password}\n`);
} finally {
  await prisma.$disconnect();
}

// Verify the new credentials really work against the running API.
try {
  const res = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: lowered, password }),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 200 && json?.data?.user) {
    console.log(`✓ เข้าสู่ระบบสำเร็จผ่าน API (role=${json.data.user.role})`);
  } else {
    console.error(`✗ ยืนยันผ่าน API ไม่สำเร็จ (${res.status}) — อาจยังไม่ได้ restart server`);
    process.exitCode = 1;
  }
} catch {
  console.error('✗ เข้าถึง API ไม่ได้ (server ที่พอร์ต 4000 อาจไม่ได้รัน)');
  process.exitCode = 1;
}
