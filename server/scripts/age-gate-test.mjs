/**
 * End-to-end check for the age gate.
 *
 * Verifies the whole promise: content is refused before the gate is answered,
 * an underage answer is not written anywhere, an accepted one is stored and
 * survives a cleared cookie, and the non-content routes stay open so a visitor
 * can actually reach the gate and a crawler can still read the sitemap.
 *
 *   node scripts/age-gate-test.mjs
 *
 * Skips itself (exit 0) when the gate is off, which is the default in
 * development — start the server with AGE_GATE_ENABLED=true to exercise it.
 *
 * It clears the AgeCheck table before and after the run: those rows are
 * disposable confirmations, not user data.
 */
import { PrismaClient } from '@prisma/client';

const base = process.env.TEST_BASE ?? 'http://localhost:4000/api';
const COOKIE = 'wksl_age';
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/** First matching Set-Cookie value, or null. */
function cookieValue(res, name) {
  const list =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  for (const entry of list) {
    const pair = entry.split(';')[0].trim();
    if (pair.startsWith(`${name}=`)) return pair.slice(name.length + 1);
  }
  return null;
}

const call = (path, { cookie, ...init } = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });

const pad = (value) => String(value).padStart(2, '0');

/**
 * `YYYY-MM-DD` for a date `yearsAgo` in the past, offset by `extraDays`.
 * Built from local parts on purpose: `toISOString()` would shift the day across
 * UTC and move the boundary tests by one — which is exactly what they check.
 */
const isoBirthDate = (yearsAgo, extraDays = 0) => {
  const now = new Date();
  const date = new Date(now.getFullYear() - yearsAgo, now.getMonth(), now.getDate() + extraDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

async function main() {
  const status = await call('/age-gate').then((r) => r.json());
  if (!status?.data?.enabled) {
    console.log('age gate is disabled (AGE_GATE_ENABLED unset) — nothing to check');
    return;
  }

  const minAge = status.data.minAge;
  console.log(`age gate is on (minimum age ${minAge})`);

  // Anything left over from a previous run would make a fresh visitor look
  // already verified, so start from an empty table.
  await prisma.ageCheck.deleteMany({});

  // --- Before answering -----------------------------------------------------
  const fresh = await call('/age-gate').then((r) => r.json());
  check('a new visitor is not verified', fresh.data.verified === false, `verified=${fresh.data.verified}`);

  const blockedPosts = await call('/posts');
  const blockedBody = await blockedPosts.json().catch(() => ({}));
  check(
    'posts are refused before the gate',
    blockedPosts.status === 403 && blockedBody?.error?.code === 'AGE_VERIFICATION_REQUIRED',
    `${blockedPosts.status} ${blockedBody?.error?.code ?? ''}`,
  );

  const blockedStats = await call('/stats');
  check('stats are refused before the gate', blockedStats.status === 403, `${blockedStats.status}`);

  const blockedCategories = await call('/categories');
  check('categories are refused before the gate', blockedCategories.status === 403, `${blockedCategories.status}`);

  // A made-up token buys nothing. Checked here, before any real confirmation
  // exists: once one does, the address match is expected to let it through.
  const forged = await call('/age-gate', { cookie: `${COOKIE}=not-a-real-token` }).then((r) => r.json());
  check('a forged cookie is not accepted', forged.data.verified === false, `verified=${forged.data.verified}`);

  const forgedPosts = await call('/posts', { cookie: `${COOKIE}=not-a-real-token` });
  check('a forged cookie does not open content', forgedPosts.status === 403, `${forgedPosts.status}`);

  // --- The routes that must stay open --------------------------------------
  const health = await call('/health');
  check('health check stays open', health.status === 200, `${health.status}`);

  const robots = await fetch(`${base.replace(/\/api$/, '')}/robots.txt`);
  check('robots.txt stays open for crawlers', robots.status === 200, `${robots.status}`);

  // --- Rejected answers -----------------------------------------------------
  const impossible = await call('/age-gate', {
    method: 'POST',
    body: JSON.stringify({ birthDate: `${new Date().getFullYear() - 30}-02-30` }),
  });
  check('an impossible date is rejected', impossible.status === 400, `${impossible.status}`);

  const future = await call('/age-gate', {
    method: 'POST',
    body: JSON.stringify({ birthDate: isoBirthDate(-1) }),
  });
  check('a future date is rejected', future.status === 400, `${future.status}`);

  const underage = await call('/age-gate', {
    method: 'POST',
    body: JSON.stringify({ birthDate: isoBirthDate(minAge - 1, 1) }),
  });
  const underageBody = await underage.json();
  check(
    'an underage answer is refused',
    underage.status === 200 && underageBody.data.eligible === false && underageBody.data.verified === false,
    `status ${underage.status} eligible=${underageBody.data?.eligible}`,
  );
  check('an underage answer sets no cookie', cookieValue(underage, COOKIE) === null);
  check('an underage answer writes nothing', (await prisma.ageCheck.count()) === 0);

  // A visitor who is exactly one day short of the threshold is still refused,
  // and one whose birthday is today is past it.
  const almost = await call('/age-gate', {
    method: 'POST',
    body: JSON.stringify({ birthDate: isoBirthDate(minAge, 1) }),
  });
  const almostBody = await almost.json();
  check(
    'the day before the birthday is refused',
    almostBody.data.eligible === false,
    `birthDate ${isoBirthDate(minAge, 1)} eligible=${almostBody.data?.eligible}`,
  );

  const birthdayToday = await call('/age-gate', {
    method: 'POST',
    body: JSON.stringify({ birthDate: isoBirthDate(minAge) }),
  });
  const todayBody = await birthdayToday.json();
  check(
    'the birthday itself is accepted',
    todayBody.data.eligible === true,
    `birthDate ${isoBirthDate(minAge)} eligible=${todayBody.data?.eligible}`,
  );

  // --- Accepted answer ------------------------------------------------------
  const adult = await call('/age-gate', {
    method: 'POST',
    body: JSON.stringify({ birthDate: isoBirthDate(minAge + 20) }),
  });
  const adultBody = await adult.json();
  const token = cookieValue(adult, COOKIE);
  check(
    'an adult answer is accepted',
    adult.status === 200 && adultBody.data.verified === true && adultBody.data.eligible === true,
    `status ${adult.status} verified=${adultBody.data?.verified}`,
  );
  check('an accepted answer sets the cookie', Boolean(token));

  const row = await prisma.ageCheck.findFirst({ orderBy: { createdAt: 'desc' } });
  check('a confirmation row is stored', Boolean(row));
  check(
    'the row keeps no date of birth',
    row ? !Object.keys(row).some((key) => /birth|date/i.test(key)) : false,
    row ? Object.keys(row).join(', ') : 'no row',
  );
  check('the stored address is a hash', row ? (row.ipHash === null || /^[0-9a-f]{64}$/.test(row.ipHash)) : false);

  // --- After answering ------------------------------------------------------
  const withCookie = await call('/age-gate', { cookie: `${COOKIE}=${token}` }).then((r) => r.json());
  check('the cookie is recognised', withCookie.data.verified === true, `verified=${withCookie.data.verified}`);

  const postsNow = await call('/posts', { cookie: `${COOKIE}=${token}` });
  check('posts open once verified', postsNow.status !== 403, `${postsNow.status}`);

  const newBrowser = await call('/age-gate').then((r) => r.json());
  check(
    'the same address is recognised without the cookie (AGE_GATE_IP_BINDING)',
    newBrowser.data.verified === true,
    `verified=${newBrowser.data.verified}`,
  );
}

try {
  await main();
} catch (err) {
  fail++;
  console.log(`  FAIL run — ${err.message}`);
} finally {
  // Leave no confirmations behind, so a rerun starts from the same place.
  await prisma.ageCheck.deleteMany({}).catch(() => undefined);
  await prisma.$disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
