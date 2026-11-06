/**
 * Read-only readiness check for one deployment target.
 *
 *   node server/scripts/preflight.mjs                  # server/.env
 *   ENV_FILE=.env.production node server/scripts/preflight.mjs
 *   node server/scripts/preflight.mjs --strict         # warnings fail too
 *
 * Inside a container there is no .env file, so the same values come from the
 * process environment — which is also supported:
 *   docker compose exec app node server/scripts/preflight.mjs
 *
 * Exits 1 when something is broken, 0 otherwise. It only reads config, pings
 * the database, lists migrations and stats files — it never writes app data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const repoRoot = path.resolve(serverRoot, '..');
const strict = process.argv.includes('--strict');

const failures = [];
const warnings = [];
const ok = (label, detail = '') => console.log(`  \u2713 ${label}${detail ? ` — ${detail}` : ''}`);
const info = (label, detail = '') => console.log(`  \u00b7 ${label}${detail ? ` — ${detail}` : ''}`);
const warn = (label, detail = '') => {
  warnings.push(label);
  console.log(`  ! ${label}${detail ? ` — ${detail}` : ''}`);
};
const fail = (label, detail = '') => {
  failures.push(label);
  console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ''}`);
};

const truthy = (value) => value === 'true' || value === '1';
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i;

// ---- environment file --------------------------------------------------------
const explicit = process.env.ENV_FILE?.trim();
const candidates = explicit
  ? [path.resolve(repoRoot, explicit), path.resolve(explicit)]
  : [path.join(serverRoot, '.env')];

let source = 'process environment (no .env file)';
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    source = candidate;
    break;
  }
}

const isProd = process.env.NODE_ENV === 'production';
console.log('\npreflight — WKSL\n');
console.log(`env:  ${source}`);
console.log(`mode: ${process.env.NODE_ENV ?? '(unset → development)'}${strict ? '   [strict]' : ''}`);

// ---- config ------------------------------------------------------------------
console.log('\nconfig');
if (isProd) ok('NODE_ENV', 'production');
else warn('NODE_ENV is not production', 'the real deployment must run with NODE_ENV=production');

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  fail('DATABASE_URL is not set');
} else {
  try {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get('schema');
    ok('DATABASE_URL', `${url.hostname}:${url.port || 5432}${url.pathname}${schema ? ` (schema ${schema})` : ''}`);
  } catch {
    fail('DATABASE_URL is not a valid URL');
  }
}

const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|your[-_ ]|example|placeholder/i;
function checkSecret(name) {
  const value = process.env[name]?.trim();
  if (!value) return fail(`${name} is not set`);
  if (value.length < 16) return fail(`${name} is too short`, `${value.length} chars, the app requires 16`);
  if (PLACEHOLDER.test(value)) return fail(`${name} still looks like a placeholder`, 'generate one with crypto.randomBytes(48).toString("hex")');
  if (value.length < 32) warn(`${name} is shorter than recommended`, `${value.length} chars — 96 hex chars is better`);
  return ok(name, `${value.length} chars`);
}
checkSecret('JWT_ACCESS_SECRET');
checkSecret('JWT_REFRESH_SECRET');
if (
  process.env.JWT_ACCESS_SECRET &&
  process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET
) {
  fail('JWT secrets are identical', 'access and refresh tokens must not share a signing key');
}

const encryptionKey = process.env.APP_ENCRYPTION_KEY?.trim();
if (!encryptionKey) warn('APP_ENCRYPTION_KEY is empty', 'TOTP shared secrets would be stored in plaintext');
else if (encryptionKey.length < 32) warn('APP_ENCRYPTION_KEY is short', `${encryptionKey.length} chars`);
else ok('APP_ENCRYPTION_KEY', `${encryptionKey.length} chars`);

const publicUrl = process.env.PUBLIC_URL?.trim();
let publicOrigin = null;
if (!publicUrl) {
  fail('PUBLIC_URL is not set', 'email links and meta tags would fall back to localhost');
} else {
  try {
    const parsed = new URL(publicUrl);
    publicOrigin = parsed.origin;
    if (isProd && LOOPBACK.test(parsed.hostname)) {
      fail('PUBLIC_URL still points at localhost', 'verification and reset links would be unusable');
    } else if (isProd && parsed.protocol !== 'https:') {
      warn('PUBLIC_URL is not https', publicUrl);
    } else {
      ok('PUBLIC_URL', publicOrigin);
    }
  } catch {
    fail('PUBLIC_URL is not a valid URL', publicUrl);
  }
}

const origins = (process.env.CLIENT_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (origins.length === 0) {
  fail('CLIENT_ORIGINS is empty', 'CORS and Socket.IO would reject every browser origin');
} else {
  const unusable = origins.filter((origin) => {
    try {
      return isProd && LOOPBACK.test(new URL(origin).hostname);
    } catch {
      return true;
    }
  });
  if (unusable.length) fail('CLIENT_ORIGINS has unusable origin(s)', unusable.join(', '));
  else ok('CLIENT_ORIGINS', origins.join(', '));

  if (publicOrigin && !origins.includes(publicOrigin)) {
    warn('PUBLIC_URL is not listed in CLIENT_ORIGINS', `add ${publicOrigin}`);
  }
  const insecure = origins.filter((origin) => origin.startsWith('http://'));
  if (isProd && insecure.length) warn('CLIENT_ORIGINS contains http:// origins', insecure.join(', '));
}

if (truthy(process.env.TRUST_PROXY ?? '')) {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  info('TRUST_PROXY', `on, ${hops} hop(s)${hops === 1 ? ' — correct for Caddy alone, use 2 behind Cloudflare' : ''}`);
} else if (isProd) {
  warn('TRUST_PROXY is off', 'behind Caddy every request looks like it came from the proxy IP');
} else {
  info('TRUST_PROXY', 'off (fine for development)');
}

const smtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
if (smtp) ok('SMTP', `${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
else if (isProd) warn('SMTP is not configured', 'verification and password-reset emails would only be written to the log');
else info('SMTP', 'off (emails go to the log)');

if (truthy(process.env.EMAIL_VERIFICATION_REQUIRED ?? '') && !smtp) {
  fail('EMAIL_VERIFICATION_REQUIRED is on without SMTP', 'new accounts could never receive the link');
}

const mailFrom = process.env.MAIL_FROM ?? '';
if (isProd && /nimbus\.local|example\.com|localhost/i.test(mailFrom)) {
  warn('MAIL_FROM still uses a local domain', mailFrom);
}

info(
  'ENABLE_JOBS',
  truthy(process.env.ENABLE_JOBS ?? '')
    ? `on, every ${process.env.JOB_INTERVAL_MINUTES ?? 15} min`
    : 'off — expected when the compose `jobs` service runs separately',
);

// ---- database ----------------------------------------------------------------
console.log('\ndatabase');
if (!databaseUrl) {
  fail('connection skipped — no DATABASE_URL');
} else {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const [target] = await prisma.$queryRawUnsafe(`
      SELECT current_database() AS db,
             host(inet_server_addr()) AS host,
             inet_server_port() AS port
    `);
    ok('connection', `${target.host}:${target.port}/${target.db}`);

    const migrationsDir = path.join(serverRoot, 'prisma', 'migrations');
    const onDisk = fs.existsSync(migrationsDir)
      ? fs
          .readdirSync(migrationsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort()
      : [];

    let ledger = [];
    try {
      ledger = await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations',
      );
    } catch (error) {
      const code = error?.meta?.code ?? '';
      const message = String(error?.message ?? error);
      if (code === '42P01' || /does not exist/i.test(message)) {
        warn('no _prisma_migrations table yet', 'a fresh database — the container applies migrations on first boot');
      } else {
        throw error;
      }
    }

    const applied = new Set(
      ledger.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name),
    );
    const pending = onDisk.filter((name) => !applied.has(name));
    const unfinished = ledger.filter((row) => !row.finished_at);
    const rolledBack = ledger.filter((row) => row.rolled_back_at);

    if (unfinished.length) {
      fail('unfinished migration(s)', `${unfinished.map((row) => row.migration_name).join(', ')} — a previous deploy died mid-way`);
    }
    if (rolledBack.length) {
      warn('rolled-back migration(s)', rolledBack.map((row) => row.migration_name).join(', '));
    }
    if (pending.length) {
      info(`${pending.length} pending migration(s)`, pending.join(', '));
      if (process.env.RUN_MIGRATIONS === 'false') {
        fail('pending migrations but RUN_MIGRATIONS=false', 'they would never be applied');
      }
    } else if (applied.size > 0) {
      ok('migrations', `${applied.size} applied, database is up to date`);
    }

    try {
      const [counts] = await prisma.$queryRawUnsafe(`
        SELECT (SELECT count(*) FROM "User")::int     AS users,
               (SELECT count(*) FROM "Post")::int     AS posts,
               (SELECT count(*) FROM "Category")::int AS categories
      `);
      info('content', `${counts.users} user(s), ${counts.posts} post(s), ${counts.categories} categories`);
      if (counts.categories === 0) {
        warn('no categories', 'the editor still works, but filters stay empty — run `npm run categories:add`');
      }
      if (counts.users === 0) {
        info('no accounts yet', 'create the owner with server/scripts/create-admin.mjs');
      }
      const demo = await prisma.user.count({ where: { email: { endsWith: '@nimbus.dev' } } });
      if (demo > 0) warn('demo account(s) found', `${demo} — purge them and create the real owner`);
    } catch (error) {
      const message = String(error?.message ?? error).split('\n')[0];
      info('content', `tables not readable yet (${message})`);
    }

  } catch (error) {
    fail('cannot connect', String(error?.message ?? error).split('\n')[0]);
  } finally {
    await prisma.$disconnect();
  }
}

// ---- files -------------------------------------------------------------------
console.log('\nfiles');
const indexHtml = path.join(repoRoot, 'client', 'dist', 'index.html');
if (fs.existsSync(indexHtml)) ok('client build', 'client/dist/index.html');
else fail('client build is missing', 'the API would 404 every page — run `npm run build`');

const uploadDir = path.resolve(serverRoot, process.env.UPLOAD_DIR?.trim() || 'uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  const probe = path.join(uploadDir, `.preflight-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
  ok('upload directory', uploadDir);
} catch (error) {
  fail('upload directory is not writable', `${uploadDir} — ${String(error?.message ?? error)}`);
}

// ---- summary -----------------------------------------------------------------
console.log(`\n${failures.length ? '\u2717' : '\u2713'} ${failures.length} failure(s), ${warnings.length} warning(s)`);
if (strict && warnings.length > 0) {
  console.log('   --strict: warnings count as failures');
  process.exit(1);
}
process.exit(failures.length > 0 ? 1 : 0);
