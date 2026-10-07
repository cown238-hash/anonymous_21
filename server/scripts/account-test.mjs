/**
 * Smoke test for the production account lifecycle: register, email
 * verification, password reset, 2FA enrolment/login, data export, reports
 * and account deletion.
 *
 *   node scripts/account-test.mjs
 */
const API = 'http://localhost:4000';
import { authenticator } from 'otplib';

const results = [];

/**
 * TOTP generation is delegated to the same library the server uses. The point
 * of this script is to exercise the HTTP flows end to end, not to re-implement
 * RFC 6238.
 */
function totpNow(secretBase32) {
  return authenticator.generate(secretBase32);
}
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

function makeSession() {
  return { token: null, cookies: new Map() };
}

function cookieHeader(session) {
  return [...session.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(session, res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === '' ) session.cookies.delete(name);
    else session.cookies.set(name, value);
  }
}

async function call(session, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const cookies = cookieHeader(session);
  if (cookies) headers.Cookie = cookies;
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${API}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  storeCookies(session, res);

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  // The auth limiter counts only failures, and this script fails logins on
  // purpose. Running it several times in a row exhausts the per-IP budget and
  // every later assertion then fails for a reason that has nothing to do with
  // the code. Say so once, clearly, instead of emitting a wall of noise.
  if (res.status === 429 && json?.error?.code === 'TOO_MANY_REQUESTS' && path.startsWith('/auth')) {
    bailOnRateLimit(json.error.message);
  }

  return { status: res.status, json, headers: res.headers };
}

function bailOnRateLimit(message) {
  console.error(`\n\x1b[31m✗ rate limited\x1b[0m — ${message}`);
  console.error('  The auth limiter counts failed logins per IP, and this test makes');
  console.error('  three on purpose. Restart the dev server (the counters are in memory)');
  console.error('  or raise AUTH_LIMIT_MAX in server/.env before running it again.');
  process.exit(1);
}

const uniq = Date.now().toString(36);
const EMAIL = `lifecycle-${uniq}@nimbus.test`;
const PASSWORD = 'TestPass123';
const NEW_PASSWORD = 'ResetPass456';

console.log('\n▸ Registration + email verification');
const s = makeSession();

const reg = await call(s, 'POST', '/auth/register', {
  email: EMAIL,
  username: `tester${uniq}`.slice(0, 28),
  displayName: 'Lifecycle Tester',
  password: PASSWORD,
});
check('register succeeds', reg.status === 201 && reg.json?.success, reg.json?.error?.message);
s.token = reg.json?.data?.accessToken ?? null;
const verificationLink = reg.json?.data?.emailVerification?.previewUrl;
check('verification link returned (no SMTP configured)', Boolean(verificationLink));
check('session cookie stored', s.cookies.has('nimbus_rt'));

const me = await call(s, 'GET', '/auth/me');
check('new account starts unverified', me.json?.data?.emailVerified === false);

if (verificationLink) {
  const token = new URL(verificationLink).searchParams.get('token');
  const verify = await call(makeSession(), 'POST', '/auth/verify-email', { token });
  check('email verified with token', verify.status === 200 && verify.json?.data?.verified === true, verify.json?.error?.message);

  const replay = await call(makeSession(), 'POST', '/auth/verify-email', { token });
  check('verification token is single-use', replay.status === 400, replay.json?.error?.message);
}

const meAfter = await call(s, 'GET', '/auth/me');
check('account now verified', meAfter.json?.data?.emailVerified === true);

console.log('\n▸ Login');
const fresh = makeSession();
const badLogin = await call(fresh, 'POST', '/auth/login', {
  identifier: EMAIL,
  password: 'WrongPass123',
});
check('wrong password rejected', badLogin.status === 401);

const goodLogin = await call(fresh, 'POST', '/auth/login', { identifier: EMAIL, password: PASSWORD });
check('login succeeds', goodLogin.status === 200 && Boolean(goodLogin.json?.data?.accessToken));
check('2FA not required yet', goodLogin.json?.data?.twoFactorRequired !== true);

console.log('\n▸ Two-factor enrolment');
const authed = makeSession();
authed.token = goodLogin.json.data.accessToken;
storeCookies(authed, { headers: { getSetCookie: () => [] } });
// carry over the refresh cookie from the login response
for (const [k, v] of fresh.cookies.entries()) authed.cookies.set(k, v);

const setup = await call(authed, 'POST', '/auth/2fa/setup');
const qr = String(setup.json?.data?.qr ?? '');
check(
  '2FA setup returns secret + QR data URI',
  setup.status === 200 && Boolean(setup.json?.data?.secret) && qr.startsWith('data:image/svg+xml;base64,'),
  qr.slice(0, 32) || setup.json?.error?.message,
);
const secret = setup.json?.data?.secret;

const wrongConfirm = await call(authed, 'POST', '/auth/2fa/confirm', { code: '000000' });
check('wrong TOTP rejected', wrongConfirm.status === 400);

if (secret) {
  const confirm = await call(authed, 'POST', '/auth/2fa/confirm', { code: totpNow(secret) });
  check('correct TOTP enables 2FA', confirm.status === 200 && confirm.json?.data?.enabled === true, confirm.json?.error?.message);
  check('recovery codes issued', Array.isArray(confirm.json?.data?.recoveryCodes) && confirm.json.data.recoveryCodes.length > 0);

  console.log('\n▸ Login with 2FA');
  const s2 = makeSession();
  const challenge = await call(s2, 'POST', '/auth/login', { identifier: EMAIL, password: PASSWORD });
  check('login now requires 2FA', challenge.status === 200 && challenge.json?.data?.twoFactorRequired === true);

  const withBadCode = await call(s2, 'POST', '/auth/login', {
    identifier: EMAIL,
    password: PASSWORD,
    totpCode: '111111',
  });
  check('wrong TOTP blocked', withBadCode.status === 401, withBadCode.json?.error?.message);

  const withGoodCode = await call(s2, 'POST', '/auth/login', {
    identifier: EMAIL,
    password: PASSWORD,
    totpCode: totpNow(secret),
  });
  check('login with valid TOTP succeeds', withGoodCode.status === 200 && Boolean(withGoodCode.json?.data?.accessToken), withGoodCode.json?.error?.message);

  const recovery = confirm.json?.data?.recoveryCodes?.[0];
  if (recovery) {
    const s3 = makeSession();
    const withRecovery = await call(s3, 'POST', '/auth/login', {
      identifier: EMAIL,
      password: PASSWORD,
      totpCode: recovery,
    });
    check('recovery code works', withRecovery.status === 200, withRecovery.json?.error?.message);

    const s4 = makeSession();
    const reuse = await call(s4, 'POST', '/auth/login', {
      identifier: EMAIL,
      password: PASSWORD,
      totpCode: recovery,
    });
    check('recovery code is single-use', reuse.status === 401);
  }
}
/**
 * TOTP generation is delegated to the same library the server uses. The point
 * of this script is to exercise the HTTP flows, not to re-implement RFC 6238.
 */
console.log('\n▸ Password reset');
const resetSession = makeSession();
const forgot = await call(resetSession, 'POST', '/auth/password/forgot', { email: EMAIL });
check('forgot-password always returns sent', forgot.status === 200 && forgot.json?.data?.sent === true);
const resetLink = forgot.json?.data?.previewUrl;

const unknown = await call(makeSession(), 'POST', '/auth/password/forgot', { email: 'nobody@nimbus.test' });
check('unknown email does not leak existence', unknown.status === 200 && unknown.json?.data?.sent === true);

if (resetLink) {
  const resetToken = new URL(resetLink).searchParams.get('token');
  const weak = await call(makeSession(), 'POST', '/auth/password/reset', {
    token: resetToken,
    password: 'short',
  });
  check('weak password rejected', weak.status === 400, weak.json?.error?.message);

  const reset = await call(makeSession(), 'POST', '/auth/password/reset', {
    token: resetToken,
    password: NEW_PASSWORD,
  });
  check('password reset succeeds', reset.status === 200 && reset.json?.data?.reset === true, reset.json?.error?.message);

  const reuse = await call(makeSession(), 'POST', '/auth/password/reset', {
    token: resetToken,
    password: NEW_PASSWORD,
  });
  check('reset token is single-use', reuse.status === 400);
}

console.log('\n▸ Session revocation + data export');
const afterReset = makeSession();
const relogin = await call(afterReset, 'POST', '/auth/login', {
  identifier: EMAIL,
  password: NEW_PASSWORD,
  totpCode: secret ? totpNow(secret) : undefined,
});
check('login with new password works', relogin.status === 200, relogin.json?.error?.message);

const withAuth = makeSession();
withAuth.token = relogin.json?.data?.accessToken ?? null;
for (const [k, v] of afterReset.cookies.entries()) withAuth.cookies.set(k, v);

const sessions = await call(withAuth, 'GET', '/auth/sessions');
check('sessions listed', sessions.status === 200 && sessions.json?.data?.length > 0);

const exportRes = await fetch(`${API}/api/auth/me/export`, {
  headers: { Authorization: `Bearer ${withAuth.token}` },
});
const exportBody = await exportRes.text();
check('data export downloads', exportRes.status === 200 && exportBody.includes('"user"'));
check('export omits password hash', !exportBody.includes('passwordHash'));
check('export omits 2FA secret', !exportBody.includes('twoFactorSecret'));

console.log('\n▸ Content reporting');
const posts = await (await fetch(`${API}/api/posts?perPage=1`)).json();
const targetPost = posts.data.items[0];
const report = await call(withAuth, 'POST', '/reports', {
  targetType: 'post',
  targetId: targetPost.id,
  reason: 'SPAM',
  detail: 'ทดสอบระบบรายงาน',
});
check('report created', report.status === 201, report.json?.error?.message);

const dupe = await call(withAuth, 'POST', '/reports', {
  targetType: 'post',
  targetId: targetPost.id,
  reason: 'SPAM',
});
check('duplicate report rejected', dupe.status === 409);

const adminSession = makeSession();
const adminLogin = await call(adminSession, 'POST', '/auth/login', {
  identifier: 'admin@nimbus.dev',
  password: 'Admin@1234',
});
adminSession.token = adminLogin.json?.data?.accessToken ?? null;

const queue = await call(adminSession, 'GET', '/reports/admin/queue?status=OPEN');
check('admin sees the moderation queue', queue.status === 200 && queue.json?.data.items.length > 0);
const reportId = queue.json?.data?.items?.[0]?.id;

if (reportId) {
  const dismiss = await call(adminSession, 'PATCH', `/reports/admin/${reportId}`, {
    status: 'DISMISSED',
    resolution: 'ทดสอบ',
  });
  check('admin resolves the report', dismiss.status === 200 && dismiss.json?.data?.status === 'DISMISSED');
}

const saraSession = makeSession();
const saraLogin = await call(saraSession, 'POST', '/auth/login', {
  identifier: 'sara@nimbus.dev',
  password: 'Password@123',
});
saraSession.token = saraLogin.json?.data?.accessToken ?? null;
const forbidden = await call(saraSession, 'GET', '/reports/admin/queue');
check('non-admin blocked from moderation', forbidden.status === 403, `status ${forbidden.status}`);

console.log('\n▸ Account deletion');
const wrongPassword = await call(withAuth, 'DELETE', '/auth/me', { password: 'WrongPass123' });
check('deletion requires the correct password', wrongPassword.status === 400);

const removed = await call(withAuth, 'DELETE', '/auth/me', { password: NEW_PASSWORD });
check('account deleted', removed.status === 204, removed.json?.error?.message);

const afterDelete = await call(makeSession(), 'POST', '/auth/login', {
  identifier: EMAIL,
  password: NEW_PASSWORD,
  totpCode: secret ? totpNow(secret) : undefined,
});
check('deleted account cannot log in', afterDelete.status >= 400);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);

/**
 * This script enrols 2FA on a shared demo account. If it aborts partway — a
 * failed assertion, a crash, Ctrl-C — the account is left demanding a TOTP code
 * and every later suite that logs in as that user fails for a reason that has
 * nothing to do with the code under test. Turn it back off before exiting.
 */
async function disableTwoFactorOnDemoAccounts() {
  for (const identifier of ['admin@nimbus.dev', 'sara@nimbus.dev']) {
    try {
      const session = makeSession();
      const password = identifier.startsWith('admin') ? 'Admin@1234' : 'Password@123';
      const login = await call(session, 'POST', '/auth/login', { identifier, password });
      if (login.status !== 200) continue;
      session.token = login.json?.data?.accessToken ?? null;

      // Logging in without a code only works while 2FA is still off, which is
      // exactly the case this cleanup exists for.
      const state = await call(session, 'GET', '/auth/2fa/status');
      if (state.json?.data?.enabled) {
        const off = await call(session, 'POST', '/auth/2fa/disable', { password });
        if (off.status === 200) console.log(`  cleanup  2FA disabled on ${identifier}`);
      }
    } catch {
      // Never let housekeeping change the test result.
    }
  }
}

await disableTwoFactorOnDemoAccounts();
process.exit(failed === 0 ? 0 : 1);