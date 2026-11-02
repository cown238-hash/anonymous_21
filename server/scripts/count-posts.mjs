import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.post.count();
  const posts = await prisma.post.findMany({
    select: { id: true, title: true, slug: true, status: true, authorId: true, categoryId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('จำนวนบทความทั้งหมดในฐานข้อมูล:', count);
  console.table(posts);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
