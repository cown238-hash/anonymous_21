/**
 * Deletes upload files that no row references. Unlike the maintenance job this
 * ignores file age, so it is for local housekeeping after a test run — never
 * point it at a machine where uploads may be mid-request.
 *
 * Usage: node scripts/prune-uploads-now.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const dotenv = path.join(root, '.env');
if (fs.existsSync(dotenv)) {
  for (const line of fs.readFileSync(dotenv, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] === 'DATABASE_URL') continue;
    process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const uploadDir = process.env.UPLOAD_DIR
  ? path.isAbsolute(process.env.UPLOAD_DIR)
    ? process.env.UPLOAD_DIR
    : path.join(root, process.env.UPLOAD_DIR)
  : path.join(root, 'uploads');

const dryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

try {
  const [avatars, covers, attachments] = await Promise.all([
    prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    prisma.post.findMany({ where: { coverImage: { not: null } }, select: { coverImage: true } }),
    prisma.attachment.findMany({ select: { filename: true } }),
  ]);

  const referenced = new Set(attachments.map((a) => a.filename));
  for (const row of [...avatars, ...covers]) {
    const url = row.avatarUrl ?? row.coverImage;
    if (url?.startsWith('/uploads/')) referenced.add(path.basename(url));
  }

  const files = fs.readdirSync(uploadDir).filter((f) => !f.startsWith('.'));
  const orphans = files.filter((f) => !referenced.has(f));

  for (const filename of orphans) {
    if (dryRun) {
      console.log(`  would remove ${filename}`);
    } else {
      fs.unlinkSync(path.join(uploadDir, filename));
      console.log(`  removed ${filename}`);
    }
  }
  console.log(`${dryRun ? 'dry run: ' : ''}${orphans.length} unreferenced file(s) of ${files.length} total`);
} catch (err) {
  console.error('✗', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
