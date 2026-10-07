/**
 * Applies a SQL file to the database without going through the Prisma CLI.
 *
 * The `prisma migrate diff` / `migrate deploy` commands hang in this
 * environment (the query engine never returns), so migrations are applied with
 * a direct `pg` connection instead. The SQL itself is written by hand and kept
 * in `prisma/migrations/<timestamp>_<name>/migration.sql` so the history stays
 * readable and `prisma migrate status` still recognises it.
 *
 * Usage: node scripts/apply-migration.mjs prisma/migrations/<dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env reader — the server config module is TypeScript-only.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || match[1] === 'DATABASE_URL') continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    process.env[match[1]] ??= value;
  }
}

loadEnvFile(path.join(root, '.env'));

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/apply-migration.mjs <migration-dir>');
  process.exit(1);
}

const sqlFile = path.join(root, target, 'migration.sql');
if (!fs.existsSync(sqlFile)) {
  console.error(`✗ migration not found: ${sqlFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf8').replace(/^\uFEFF/, '');

/**
 * The driver only accepts one statement per prepared statement, so split the
 * file into individual commands. Statement bodies here never contain a literal
 * semicolon, which makes a plain split safe.
 */
function splitStatements(source) {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Prisma's own migration ledger, recreated verbatim after a schema reset. */
const LEDGER_DDL = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id VARCHAR(36) PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMPTZ,
  migration_name VARCHAR(512) NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL
)`;

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(LEDGER_DDL);

  // A migration directory that Prisma has already recorded is a no-op, which
  // keeps the script safe to re-run after a partial failure.
  const name = path.basename(target);
  const existing = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1',
    name,
  );
  if (existing.length > 0) {
    console.log(`= already applied: ${name}`);
  } else {
    const statements = splitStatements(sql);
    // One transaction: a migration either lands completely or not at all, so a
    // failure can never leave the schema half-updated.
    await prisma.$transaction([
      ...statements.map((statement) => prisma.$executeRawUnsafe(statement)),
      // Record the migration so `prisma migrate status` and future diffs agree
      // with what is actually in the database.
      prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, rolled_back_at, logs, applied_steps_count)
         VALUES ($1, $2, $3, NOW(), NOW(), NULL, NULL, $4)`,
        crypto.randomBytes(12).toString('hex'),
        crypto.createHash('sha256').update(sql).digest('hex'),
        name,
        statements.length,
      ),
    ]);
    console.log(`✓ applied: ${name} (${statements.length} statements)`);
  }
} catch (err) {
  console.error('✗ migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
