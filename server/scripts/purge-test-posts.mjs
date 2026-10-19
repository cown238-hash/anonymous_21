/**
 * Removes the throwaway posts created while verifying uploads, video playback
 * and Range requests. Matches by title because they never shipped anywhere.
 *
 *   node scripts/purge-test-posts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const PATTERNS = ['Range request', 'ทดสอบการเล่นวีดีโอ', 'ทดสอบแนบรูปภาพ'];

// The uploader lives next to the Prisma client; uploads/ is a sibling of src/.
const uploadDir = path.resolve(process.cwd(), 'uploads');

try {
  const posts = await prisma.post.findMany({
    where: { OR: PATTERNS.map((p) => ({ title: { contains: p } })) },
    select: { id: true, title: true, coverImage: true, attachments: { select: { filename: true } } },
  });

  if (posts.length === 0) {
    console.log('no test posts found');
  }

  for (const post of posts) {
    console.log(`removing: ${post.title}`);
    if (post.coverImage) removeUploadFile(path.basename(post.coverImage));
    for (const a of post.attachments) removeUploadFile(a.filename);
    // Comments, likes and tags cascade from the post row.
    await prisma.post.delete({ where: { id: post.id } });
  }

  console.log(`\ndone — ${posts.length} post(s) removed`);
} finally {
  await prisma.$disconnect();
}

function removeUploadFile(filename) {
  const abs = path.join(uploadDir, path.basename(filename));
  try {
    fs.unlinkSync(abs);
  } catch {
    /* already gone — not worth failing the cleanup over */
  }
}