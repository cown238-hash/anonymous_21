/** Ad-hoc state check used after restoring a database backup. */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const [users, posts, comments, attachments] = await Promise.all([
    prisma.user.count(),
    prisma.post.count(),
    prisma.comment.count(),
    prisma.attachment.count(),
  ]);
  console.log(`users ${users}  posts ${posts}  comments ${comments}  attachments ${attachments}`);

  const list = await prisma.user.findMany({ select: { email: true, username: true, role: true, isHidden: true }, orderBy: { email: 'asc' } });
  for (const u of list) console.log(`  ${u.email.padEnd(22)} ${u.role.padEnd(6)} hidden=${u.isHidden}`);
} finally {
  await prisma.$disconnect();
}