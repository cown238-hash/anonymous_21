/**
 * Removes Attachment rows that were uploaded but never claimed by a post, plus
 * the files behind them. Uploads are staged with a null `postId` on purpose, so
 * this is what cleans up after a cancelled upload or a failed test run.
 *
 *   node scripts/purge-orphan-uploads.mjs [olderThanHours=24]
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const olderThanHours = Number(process.argv[2] ?? 24);
const cutoff = new Date(Date.now() - olderThanHours * 3600_000);
const uploadDir = path.resolve(process.cwd(), 'uploads');

try {
  const orphans = await prisma.attachment.findMany({
    where: { postId: null, createdAt: { lt: cutoff } },
    select: { id: true, filename: true, createdAt: true },
  });

  if (orphans.length === 0) {
    console.log(`no orphan uploads older than ${olderThanHours}h`);
  }

  for (const a of orphans) {
    const abs = path.join(uploadDir, path.basename(a.filename));
    try {
      fs.unlinkSync(abs);
    } catch {
      /* row removal is what matters; the file may already be gone */
    }
    await prisma.attachment.delete({ where: { id: a.id } });
    console.log(`  removed ${a.filename} (${a.createdAt.toISOString().slice(0, 16)})`);
  }

  console.log(`\ndone — ${orphans.length} orphan upload(s) cleared`);
} finally {
  await prisma.$disconnect();
}