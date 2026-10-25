import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const users = await prisma.user.findMany({
  select: { username: true, email: true, role: true, isBanned: true, deletedAt: true, twoFactorEnabled: true },
  orderBy: { createdAt: 'asc' },
});
console.table(users);
await prisma.$disconnect();
