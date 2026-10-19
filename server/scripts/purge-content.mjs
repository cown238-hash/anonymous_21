/**
 * Clears every piece of user content so an instance starts from zero: posts,
 * comments, likes, chat, notifications, reports, the audit trail, uploaded
 * files and all accounts.
 *
 *   node scripts/purge-content.mjs           # dry run — counts only
 *   node scripts/purge-content.mjs --yes     # actually delete
 *
 * Categories are reference data — the post editor needs one to exist — so they
 * stay. Tags belong to the posts they were used on and go with them.
 *
 * The schema and the `_prisma_migrations` ledger are deliberately untouched, so
 * the container can still run `migrate deploy` on the next boot. This is the
 * difference from `db:reset`, which drops the schema and makes every recorded
 * migration look unapplied.
 *
 * Point it at the instance you mean: it prints the host and database it is
 * about to wipe, and does nothing without `--yes`.
 *
 *   DATABASE_URL='postgresql://...' node server/scripts/purge-content.mjs --yes
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const confirmed = process.argv.includes('--yes');
// The uploads directory is a sibling of src/, resolved the same way the app
// resolves it (against the server package root, never the cwd).
const uploadDir = path.resolve(process.cwd(), 'uploads');

/** Children first, so no statement ever trips a foreign key. */
const MODELS = [
  'message',
  'conversationMember',
  'conversation',
  'notification',
  'report',
  'auditLog',
  'like',
  'comment',
  'postTag',
  'attachment',
  'post',
  'session',
  'verificationToken',
  'passwordResetToken',
  'user',
  'tag',
];

try {
  const [target] = await prisma.$queryRawUnsafe(`
    SELECT current_database() AS db,
           host(inet_server_addr()) AS host,
           inet_server_port() AS port
  `);
  console.log(`target: ${target.host}:${target.port}/${target.db}`);
  if (confirmed) {
    console.log('mode:   DELETE\n');
  } else {
    console.log('mode:   DRY RUN — add --yes to delete\n');
  }

  // Collect the files first: deleting the rows destroys the only reference to
  // each upload, and jobs.ts treats all three sources as references.
  const [avatars, covers, attachments] = await Promise.all([
    prisma.user.findMany({ where: { avatarUrl: { not: null } }, select: { avatarUrl: true } }),
    prisma.post.findMany({ where: { coverImage: { not: null } }, select: { coverImage: true } }),
    prisma.attachment.findMany({ select: { filename: true } }),
  ]);

  const files = new Set();
  for (const row of avatars) {
    if (row.avatarUrl?.startsWith('/uploads/')) files.add(path.basename(row.avatarUrl));
  }
  for (const row of covers) {
    if (row.coverImage?.startsWith('/uploads/')) files.add(path.basename(row.coverImage));
  }
  for (const row of attachments) files.add(row.filename);

  let rows = 0;
  for (const model of MODELS) {
    if (confirmed) {
      const { count } = await prisma[model].deleteMany();
      rows += count;
      console.log(`  deleted ${String(count).padStart(3)}  ${model}`);
    } else {
      const count = await prisma[model].count();
      rows += count;
      console.log(`  would delete ${String(count).padStart(3)}  ${model}`);
    }
  }

  if (!confirmed) {
    console.log(`\n${rows} rows and ${files.size} upload file(s) would be removed`);
    console.log('nothing was touched — re-run with --yes to proceed');
  } else {
    let unlinked = 0;
    for (const filename of files) {
      try {
        fs.unlinkSync(path.join(uploadDir, path.basename(filename)));
        unlinked++;
      } catch {
        /* already gone — removing the row is what mattered */
      }
    }
    const categories = await prisma.category.count();
    console.log(`\n✓ ${rows} rows removed, ${unlinked}/${files.size} upload files unlinked`);
    console.log(`  kept ${categories} categories (reference data)`);
    console.log('\nnext — create the admin account for this instance:');
    console.log("  node server/scripts/create-admin.mjs you@example.com 'StrongPassw0rd'");
  }
} finally {
  await prisma.$disconnect();
}
