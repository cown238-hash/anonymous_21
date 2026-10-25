/**
 * Proves the raised upload cap end to end: signs in, uploads a file larger
 * than the old 5 MB limit, then deletes it so the test leaves no trace.
 *
 *   node server/scripts/upload-limit-test.mjs [mb]
 *
 * BASE_URL overrides the target, e.g. BASE_URL=http://localhost:4000/api to
 * measure the app on its own, without the Cloudflare hop in the middle.
 */
const MB = Number(process.argv[2] ?? 8);
const BASE = process.env.BASE_URL ?? 'https://app.wksl.site/api';
const IDENTIFIER = process.env.TEST_IDENTIFIER ?? 'admin';
const PASSWORD = process.env.TEST_PASSWORD ?? 'XhuEfBXRFs3LhpNJ5i7FSwB7';

async function call(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, text };
}

const caps = await call('/config');
console.log(`server cap: ${caps.json?.data?.maxUploadMb} MB per file`);

const login = await call('/auth/login', {
  method: 'POST',
  body: { identifier: IDENTIFIER, password: PASSWORD },
});
if (login.status !== 200) {
  console.error(`✗ login failed (${login.status}): ${login.text.slice(0, 200)}`);
  process.exit(1);
}
const token = login.json.data.accessToken;
console.log(`✓ signed in as ${login.json.data.user.username}`);

// A valid .png MIME/extension pair with `size` bytes of payload — the server
// checks type and size, not the magic numbers.
const bytes = Buffer.alloc(MB * 1024 * 1024, 0x89);
const fd = new FormData();
fd.append('files', new Blob([bytes], { type: 'image/png' }), `limit-test-${MB}mb.png`);

const started = Date.now();
const upload = await call('/uploads/files', { method: 'POST', token, body: fd });
const elapsed = Date.now() - started;

if (upload.status === 201) {
  const file = upload.json.data.files[0];
  const onDisk = (file.size / 1024 / 1024).toFixed(1);
  console.log(`✓ ${MB} MB accepted (${upload.status}) in ${elapsed} ms — stored ${onDisk} MB as ${file.filename}`);

  const del = await call(`/uploads/files/${file.id}`, { method: 'DELETE', token });
  console.log(del.status === 200 || del.status === 204 ? '✓ cleaned up' : `cleanup: ${del.status}`);
} else {
  console.error(`✗ ${MB} MB rejected (${upload.status}): ${upload.text.slice(0, 300)}`);
  process.exitCode = 1;
}
