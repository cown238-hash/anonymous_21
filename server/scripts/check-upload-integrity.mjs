/**
 * Checks that every post attachment still has its file on disk, and that every
 * file in uploads/ is referenced by a row. Catches a purge that went too far.
 *
 *   node scripts/check-upload-integrity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const uploadDir = path.resolve(process.cwd(), 'uploads');

try {
  const attachments = await prisma.attachment.findMany({
    select: { id: true, filename: true, originalName: true, postId: true },
  });

  let problems = 0;
  for (const a of attachments) {
    const abs = path.join(uploadDir, path.basename(a.filename));
    if (!fs.existsSync(abs)) {
      console.log(`  MISSING FILE  ${a.originalName} -> ${a.filename} (post ${a.postId ?? 'none'})`);
      problems++;
    }
  }

  const onDisk = fs
    .readdirSync(uploadDir)
    .filter((f) => f !== '.gitkeep')
    .filter((f) => !attachments.some((a) => a.filename === f));

  for (const f of onDisk) {
    // Cover images live on Post.coverImage and are not Attachment rows.
    const isCover = await prisma.post.count({ where: { coverImage: { contains: f } } });
    console.log(`  unreferenced  ${f}${isCover ? ' (used as a post cover)' : ''}`);
    if (!isCover) problems++;
  }

  const posts = await prisma.post.count();
  const withCover = await prisma.post.count({ where: { coverImage: { not: null } } });
  console.log(`\n  attachment rows : ${attachments.length}`);
  console.log(`  post covers     : ${withCover} of ${posts}`);
  console.log(`\n${problems === 0 ? 'no problems found' : `${problems} problem(s)`}`);
} finally {
  await prisma.$disconnect();
}