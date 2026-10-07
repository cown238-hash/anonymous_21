/**
 * Creates a real owner account for a production database.
 *
 * Registers through the API so every signup rule (password policy, rate limits,
 * normalisation) applies exactly as it would for a human, then promotes the
 * account to ADMIN and marks the email verified — the same end state the seed
 * script gives its demo admin, without touching demo data.
 *
 * Usage:
 *   node scripts/create-admin.mjs <email> <password> [displayName] --env production
 *
 * The API base and credentials come from the chosen .env file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const args = process.argv.slice(2);
const envFlag = args.indexOf('--env');
const envName = envFlag >= 0 ? args[envFlag + 1] : 'development';
const positional = args.filter((a, i) => a !== '--env' && i !== envFlag + 1);

const [email, password, displayName] = positional;
if (!email || !password) {
  console.error('usage: node scripts/create-admin.mjs <email> <password> [displayName] [--env production]');
  process.exit(1);
}

const env = loadEnvFile(path.join(root, `.env${envName === 'development' ? '' : `.${envName}`}`));
const port = env.PORT || '4000';
const api = `http://localhost:${port}/api`;

const username = email
  .split('@')[0]
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, '')
  .slice(0, 20);

async function call(method, pathname, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${api}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

console.log(`target: ${api}  (env: ${envName})`);

const reg = await call('POST', '/auth/register', {
  email,
  username,
  displayName: displayName || 'WKSL Admin',
  password,
});

if (reg.status !== 201) {
  console.error(`✗ register failed (${reg.status}): ${reg.json?.error?.message ?? 'unknown error'}`);
  process.exit(1);
}

let token = reg.json.data.accessToken;
const userId = reg.json.data.user.id;
console.log(`✓ registered ${email} as ${username} (id ${userId})`);

// Promote through Prisma rather than the admin API: this account is the thing
// being bootstrapped, so it cannot yet sign in as an admin.
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
try {
  await prisma.user.update({
    where: { id: userId },
    data: { role: 'ADMIN', emailVerified: true, emailVerifiedAt: new Date() },
  });
  console.log('✓ promoted to ADMIN and marked the email verified');

  const lounge = await prisma.conversation.findFirst({ where: { title: 'WKSL Lounge' } });
  if (lounge) {
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: lounge.id, userId } },
      create: { conversationId: lounge.id, userId },
      update: {},
    });
    console.log('✓ joined WKSL Lounge');
  }
} finally {
  await prisma.$disconnect();
}

// Confirm the account can actually sign in as an admin.
const login = await call('POST', '/auth/login', { identifier: email, password });
if (login.status === 200 && login.json?.data?.user?.role === 'ADMIN') {
  console.log('\n✓ sign-in verified — this is your real admin account:');
  console.log(`    ${email} / ${password}`);
} else {
  console.error(`\n✗ sign-in verification failed (${login.status}): ${login.json?.error?.message ?? ''}`);
  process.exitCode = 1;
}

token = null;
