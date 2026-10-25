// Quick smoke test for /api/push/* against the running server.
// Registers (or logs in) a throwaway user, subscribes, verifies the row,
// unsubscribes, verifies it is gone.
import { PrismaClient } from '@prisma/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4000';
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function check(name, ok, extra = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function call(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, json };
}

const stamp = Date.now();
const email = `pushtest-${stamp}@example.com`;
const password = 'PushTest@1234';

try {
  console.log('\n▸ Public key');
  const pub = await call(null, 'GET', '/push/public-key');
  check('public-key answers 200', pub.status === 200);
  check('reports enabled with a key', pub.json?.data?.enabled === true && Boolean(pub.json?.data?.publicKey));

  console.log('\n▸ Auth required');
  const anonSub = await call(null, 'POST', '/push/subscribe', {
    endpoint: 'https://push.example.com/anon',
    keys: { p256dh: 'a', auth: 'b' },
  });
  check('anonymous subscribe rejected', anonSub.status === 401);

  console.log('\n▸ Register + login');
  const reg = await call(null, 'POST', '/auth/register', {
    email,
    username: `pushtest${stamp}`,
    displayName: 'Push Test',
    password,
  });
  check('register works', reg.status === 201 || reg.status === 200, `status ${reg.status}`);
  const login = await call(null, 'POST', '/auth/login', { identifier: email, password });
  check('login works', login.status === 200, `status ${login.status}`);
  const token = login.json?.data?.accessToken;
  if (!token) throw new Error('no access token');

  console.log('\n▸ Subscribe');
  const endpoint = `https://push.example.com/push-test-${stamp}`;
  const sub = await call(token, 'POST', '/push/subscribe', {
    endpoint,
    keys: { p256dh: 'BP-test-p256dh', auth: 'B-test-auth' },
  });
  check('subscribe answers 204', sub.status === 204, `status ${sub.status}`);
  const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  check('row stored with userId', row?.userId === login.json?.data?.user?.id, JSON.stringify(row));

  console.log('\n▸ Validation');
  const bad = await call(token, 'POST', '/push/subscribe', { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } });
  check('bad endpoint rejected', bad.status === 400);

  console.log('\n▸ Re-subscribe is idempotent');
  const again = await call(token, 'POST', '/push/subscribe', {
    endpoint,
    keys: { p256dh: 'BP-test-p256dh-2', auth: 'B-test-auth-2' },
  });
  check('second subscribe also 204', again.status === 204, `status ${again.status}`);
  const updated = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  check('key rotated in place', updated?.p256dh === 'BP-test-p256dh-2');

  console.log('\n▸ Unsubscribe');
  const unsub = await call(token, 'POST', '/push/unsubscribe', { endpoint });
  check('unsubscribe answers 204', unsub.status === 204, `status ${unsub.status}`);
  const gone = await prisma.pushSubscription.findUnique({ where: { endpoint } });
  check('row deleted', gone === null);

  console.log('\n▸ Other users cannot unsubscribe yours');
  const reg2 = await call(null, 'POST', '/auth/register', {
    email: `pushtest2-${stamp}@example.com`,
    username: `pushtest2${stamp}`,
    displayName: 'Push Test 2',
    password,
  });
  const login2 = await call(null, 'POST', '/auth/login', { identifier: `pushtest2-${stamp}@example.com`, password });
  const token2 = login2.json?.data?.accessToken;
  if (reg2.status < 300 && token2) {
    await call(token, 'POST', '/push/subscribe', { endpoint, keys: { p256dh: 'x', auth: 'y' } });
    const cross = await call(token2, 'POST', '/push/unsubscribe', { endpoint });
    check('foreign unsubscribe is a no-op', cross.status === 204);
    const still = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    check('row survives foreign unsubscribe', still !== null);
    await call(token, 'POST', '/push/unsubscribe', { endpoint });
  }
} catch (err) {
  fail += 1;
  console.error('\nFATAL:', err?.message ?? err);
} finally {
  // Leave no test rows or accounts behind.
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: 'push-test-' } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'pushtest' } } });
  await prisma.$disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}
