/**
 * Replaces the seeded demo accounts with one real admin account, keeping every
 * post (and the comments, likes and attachments under them) by reassigning
 * authorship rather than deleting the rows.
 *
 *   node scripts/retire-demo-users.mjs
 *
 * Safe to re-run: if the real admin already exists it only repairs ownership.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

/** Anything at these domains came from `prisma/seed.ts`. */
const DEMO_EMAIL_DOMAIN = 'nimbus.dev';

const ADMIN = {
  // `username` is unique and the seeded admin already holds "admin", so the new
  // account is created under a temporary handle and renamed to the clean one
  // once the demo rows are gone.
  username: 'wsk-admin',
  displayName: 'WKSL Admin',
  email: 'admin@wsk.app',
};
const FINAL_USERNAME = 'admin';

/** Alphanumeric only, so it survives a copy/paste without shell surprises. */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const all = upper + lower + digits + symbols;
  const pick = (set) => set[crypto.randomInt(set.length)];

  // One of each class, then fill to length.
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 20) chars.push(pick(all));
  // Fisher-Yates with a CSPRNG so the classes are not always in one order.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function strongPassword() {
  // The app's own policy: at least one upper, lower, digit and symbol.
  const p = generatePassword();
  return p;
}

async function main() {
  console.log('demo accounts\n------------');
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } },
    select: { id: true, username: true, email: true, _count: { select: { posts: true, comments: true } } },
  });
  if (demoUsers.length === 0) console.log('  (none left)');
  for (const u of demoUsers) {
    console.log(`  ${u.email.padEnd(22)} ${String(u._count.posts).padStart(2)} posts  ${String(u._count.comments).padStart(2)} comments`);
  }

  console.log('\nreal admin\n----------');
  // Look the admin up by EMAIL, not username: the seeded demo admin is also
  // called "admin", and matching on the username would adopt an account that is
  // about to be deleted — taking every reassigned post down with it.
  let admin = await prisma.user.findUnique({ where: { email: ADMIN.email } });
  let password = null;

  if (admin) {
    console.log(`  ${ADMIN.email} already exists (id ${admin.id}) — reusing it`);
    if (admin.role !== Role.ADMIN) {
      admin = await prisma.user.update({ where: { id: admin.id }, data: { role: Role.ADMIN } });
      console.log('  promoted to ADMIN');
    }
  } else {
    password = strongPassword();
    admin = await prisma.user.create({
      data: {
        username: ADMIN.username,
        displayName: ADMIN.displayName,
        email: ADMIN.email,
        passwordHash: await bcrypt.hash(password, 12),
        role: Role.ADMIN,
        // The owner set this up by hand, so there is no confirmation email to
        // chase — leaving it false would hide the account behind a resend loop.
        emailVerified: true,
        emailVerifiedAt: new Date(),
        bio: 'ผู้ดูแลระบบ WKSL',
        location: 'Bangkok, Thailand',
      },
    });
    console.log(`  created ${ADMIN.email} (id ${admin.id})`);
  }

  if (demoUsers.length === 0) {
    console.log('\nnothing to reassign');
    return;
  }

  // The admin must survive the delete below.
  const doomed = demoUsers.filter((u) => u.id !== admin.id);
  const skipped = demoUsers.filter((u) => u.id === admin.id);
  if (skipped.length > 0) {
    console.log(`\n  note: ${skipped.map((u) => u.email).join(', ')} is the chosen admin — keeping it`);
  }
  if (doomed.length === 0) {
    console.log('\nnothing to reassign');
    return;
  }
  const demoIds = doomed.map((u) => u.id);

  console.log('\nreassigning\n-----------');
  const [posts, comments, attachments, likes] = await Promise.all([
    prisma.post.updateMany({ where: { authorId: { in: demoIds } }, data: { authorId: admin.id } }),
    prisma.comment.updateMany({ where: { authorId: { in: demoIds } }, data: { authorId: admin.id } }),
    prisma.attachment.updateMany({ where: { uploadedById: { in: demoIds } }, data: { uploadedById: admin.id } }),
    // A Like has a composite key; collapse the duplicates the reassignment would
    // otherwise create, then move what is left.
    prisma.like.findMany({ where: { userId: { in: demoIds } }, select: { userId: true, postId: true } }),
  ]);
  let movedLikes = 0;
  for (const like of likes) {
    try {
      await prisma.like.create({ data: { userId: admin.id, postId: like.postId } });
      movedLikes++;
    } catch {
      // Already liked by the admin — dropping this one is correct.
    }
  }
  console.log(`  posts       ${posts.count}`);
  console.log(`  comments    ${comments.count}`);
  console.log(`  attachments ${attachments.count}`);
  console.log(`  likes       ${movedLikes} (duplicates collapsed)`);

  console.log('\ndeleting demo accounts\n-----------------------');
  // Sessions and tokens cascade, so every demo login is invalidated here.
  await prisma.user.deleteMany({ where: { id: { in: demoIds } } });
  console.log(`  removed ${demoIds.length} accounts`);

  // The handle is free now — claim it.
  if (admin.username !== FINAL_USERNAME) {
    const taken = await prisma.user.findUnique({ where: { username: FINAL_USERNAME }, select: { id: true } });
    if (!taken) {
      await prisma.user.update({ where: { id: admin.id }, data: { username: FINAL_USERNAME } });
      console.log(`  renamed ${ADMIN.username} -> ${FINAL_USERNAME}`);
      admin = { ...admin, username: FINAL_USERNAME };
    } else {
      console.log(`  kept username ${admin.username} (${FINAL_USERNAME} is taken)`);
    }
  }

  console.log('\nresult\n------');
  const [userCount, postCount, commentCount] = await Promise.all([
    prisma.user.count(),
    prisma.post.count(),
    prisma.comment.count(),
  ]);
  console.log(`  users    ${userCount}`);
  console.log(`  posts    ${postCount}`);
  console.log(`  comments ${commentCount}`);

  if (password) {
    console.log('\n  ┌─────────────────────────────────────────┐');
    console.log('  │  บัญชีแอดมินของคุณ                     │');
    console.log('  ├─────────────────────────────────────────┤');
    console.log(`  │  อีเมล      ${ADMIN.email.padEnd(28)}│`);
    console.log(`  │  รหัสผ่าน   ${password.padEnd(28)}│`);
    console.log('  └─────────────────────────────────────────┘');
    console.log('  บันทึกรหัสผ่านนี้ไว้ — มันจะไม่แสดงอีก');
  }
  console.log(`\n  โปรไฟล์: http://localhost:5173/u/${admin.username}`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}