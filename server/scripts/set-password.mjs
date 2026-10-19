/**
 * Sets a password for an account without going through the API, for when the
 * current one is unusable (lost, too long, awkward characters).
 *
 *   node scripts/set-password.mjs <email> <password>
 *
 * The password must satisfy the same rule the register endpoint enforces:
 * at least 8 characters, at least one letter and one digit.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const [email, password] = process.argv.slice(2);

function validate(pw) {
  if (pw.length < 8) throw new Error('ต้องมีอย่างน้อย 8 ตัวอักษร');
  if (pw.length > 100) throw new Error('ยาวเกิน 100 ตัวอักษร');
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) throw new Error('ต้องมีทั้งตัวอักษรและตัวเลข');
}

try {
  if (!email || !password) {
    console.error('usage: node scripts/set-password.mjs <email> <password>');
    process.exit(2);
  }
  validate(password);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, username: true } });
  if (!user) {
    console.error(`ไม่พบบัญชี ${email}`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 12),
      // Changing a password invalidates every session, so start clean.
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  // Cascades on user delete only, so clear them explicitly.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`อัปเดตรหัสผ่านของ @${user.username} แล้ว (ปิดทุกเซสชันเดิม)`);
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}