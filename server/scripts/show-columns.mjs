/** Prints the columns of a table — used to verify migrations applied cleanly. */
import { PrismaClient } from '@prisma/client';

const table = process.argv[2] ?? 'Attachment';
const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
    table,
  );
  console.log(`${table}:`);
  for (const row of rows) console.log(`  ${row.column_name.padEnd(16)} ${row.data_type.padEnd(28)} null=${row.is_nullable}`);
} catch (err) {
  console.error('✗', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
