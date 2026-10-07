/**
 * Drops and recreates every table Prisma owns, then clears the migration
 * ledger. Only ever useful against a local scratch database — the script
 * refuses to run unless the target schema is named in ALLOWED_DATABASES.
 *
 * Usage: node scripts/db-reset.mjs
 */
import { PrismaClient } from '@prisma/client';

/** Local development schemas this script is allowed to wipe. */
const ALLOWED_DATABASES = ['nimbus'];

const prisma = new PrismaClient();

try {
  const [row] = await prisma.$queryRawUnsafe('SELECT current_database() AS name');
  const name = row.name;
  if (!ALLOWED_DATABASES.includes(name)) {
    throw new Error(`refusing to reset database "${name}" — add it to ALLOWED_DATABASES if that is intended`);
  }
  console.log(`⚠ resetting schema "${name}"`);
  // Two statements: the driver refuses more than one command per prepared
  // statement.
  await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  console.log('✓ schema dropped and recreated (run migrations + seed next)');
} catch (err) {
  console.error('✗', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
