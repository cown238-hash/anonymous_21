/**
 * Checks for profile hiding: a hidden account disappears from the member
 * directory and its profile page 404s for everyone except the owner and
 * admins — without leaking its existence.
 *
 * Usage: node scripts/privacy-test.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:4000';

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  \x1b[32mPASS\x1b[0m ${label}`);
  } else {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n\x1b[1m▸ ${name}\x1b[0m`);
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(identifier, password) {
  const res = await api('/auth/login', { method: 'POST', body: { identifier, password } });
  if (!res.json?.success) throw new Error(`login failed for ${identifier}`);
  return res.json.data.accessToken;
}

const admin = await login('admin@nimbus.dev', 'Admin@1234');
const sara = await login('sara@nimbus.dev', 'Password@123');
const tony = await login('tony@nimbus.dev', 'Password@123');

const inDirectory = async (token, username) => {
  const res = await api(`/users?q=${username}&perPage=50`, { token });
  const items = res.json?.data?.items ?? [];
  return items.some((u) => u.username === username);
};

section('Baseline');
check('sara is listed before hiding', await inDirectory(tony, 'sara'));
const profileBefore = await api('/users/sara', { token: tony });
check('sara profile is public before hiding', profileBefore.status === 200);

section('Hide');
const hide = await api('/auth/me', { method: 'PATCH', token: sara, body: { isHidden: true } });
check('toggle accepted', hide.status === 200 && hide.json?.data?.isHidden === true);
const me = await api('/auth/me', { token: sara });
check('own record reports the flag', me.json?.data?.isHidden === true);

section('Hidden from others');
check('sara vanishes from the directory', !(await inDirectory(tony, 'sara')));
const asStranger = await api('/users/sara', { token: tony });
check('profile 404s for other members', asStranger.status === 404);
const asGuest = await api('/users/sara');
check('profile 404s for guests too', asGuest.status === 404);
const searchGuest = await api('/users?q=sara&perPage=50');
check('directory hides from guests too', !(searchGuest.json?.data?.items ?? []).some((u) => u.username === 'sara'));

section('Owner and admin still see it');
const asSelf = await api('/users/sara', { token: sara });
check('owner still sees own profile', asSelf.status === 200);
const asAdmin = await api('/users/sara', { token: admin });
check('admin still sees the profile', asAdmin.status === 200);
check('admin still sees the directory row', await inDirectory(admin, 'sara'));
const adminRow = await api('/users?q=sara&perPage=50', { token: admin });
check(
  'directory flags the row for admins',
  (adminRow.json?.data?.items ?? []).some((u) => u.username === 'sara' && u.isHidden === true),
);
const adminList = await api('/admin/users?q=sara', { token: admin });
check(
  'admin panel carries the flag',
  (adminList.json?.data?.items ?? []).some((u) => u.username === 'sara' && u.isHidden === true),
);

section('Public content untouched');
const posts = await api('/users/sara/posts', { token: tony });
check('published posts stay public', posts.status === 200);

section('Unhide');
const show = await api('/auth/me', { method: 'PATCH', token: sara, body: { isHidden: false } });
check('toggle back accepted', show.status === 200 && show.json?.data?.isHidden === false);
check('sara is listed again', await inDirectory(tony, 'sara'));
const profileAfter = await api('/users/sara', { token: tony });
check('profile is public again', profileAfter.status === 200);

section('Validation');
const bad = await api('/auth/me', { method: 'PATCH', token: sara, body: { isHidden: 'yes' } });
check('non-boolean rejected', bad.status === 400);

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
