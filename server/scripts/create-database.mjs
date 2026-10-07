/**
 * Creates a PostgreSQL database without psql on PATH.
 *
 * `psql` ships with the PostgreSQL install, so this locates it from the Windows
 * install path rather than adding a driver dependency to the project.
 *
 * Usage: node scripts/create-database.mjs <dbName>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/** Minimal .env reader — the server config module is TypeScript-only. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvFile(path.join(root, '.env'));

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/create-database.mjs <dbName>');
  process.exit(1);
}

// Unquoted-identifier pattern only: this is what keeps the CREATE DATABASE
// statement safe to build as text.
if (!/^[a-z_][a-z0-9_]*$/.test(target)) {
  console.error(`✗ "${target}" is not a valid unquoted PostgreSQL identifier`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL is missing from server/.env');
  process.exit(1);
}

const parsed = new URL(url);
const user = decodeURIComponent(parsed.username);
const password = decodeURIComponent(parsed.password);
const host = parsed.hostname;
const port = parsed.port || '5432';

/** Finds psql.exe in the standard Windows install locations. */
function findPsql() {
  const roots = [
    'C:\\Program Files\\PostgreSQL',
    'C:\\Program Files (x86)\\PostgreSQL',
    'C:\\tools\\PostgreSQL',
  ];
  for (const dir of roots) {
    if (!fs.existsSync(dir)) continue;
    for (const version of fs.readdirSync(dir)) {
      const candidate = path.join(dir, version, 'bin', 'psql.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const psql = findPsql();
if (!psql) {
  console.error('✗ could not find psql.exe — install the PostgreSQL client tools,');
  console.error('  or create the database from a SQL client of your choice.');
  process.exit(1);
}

/** Runs one statement against the maintenance database. */
function psqlRun(sql) {
  return execFileSync(
    psql,
    ['-h', host, '-p', port, '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

try {
  const exists = psqlRun(`SELECT 1 FROM pg_database WHERE datname = '${target}'`);
  if (exists === '1') {
    console.log(`= database "${target}" already exists — nothing to do`);
  } else {
    psqlRun(`CREATE DATABASE "${target}" ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`✓ created database "${target}" on ${host}:${port}`);
  }
} catch (err) {
  const detail = (err.stderr || err.message || '').trim();
  console.error(`✗ ${detail}`);
  process.exit(1);
}
