/**
 * Reproduces a file upload the same way the browser does, so a failure points
 * at the server rather than at PowerShell/curl quirks.
 *
 *   node scripts/upload-test.mjs
 */
const base = process.env.TEST_BASE ?? 'http://localhost:4000/api';
// Seeded demo admin — see `npm run db:seed`. Override from the environment on a
// real deployment; never hard-code a live credential here.
const EMAIL = process.env.TEST_EMAIL ?? 'admin@nimbus.dev';
const PASSWORD = process.env.TEST_PASSWORD ?? 'Admin@1234';

async function main() {
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  const body = await login.json();
  if (!login.ok || !body?.data?.accessToken) {
    console.log(`login failed: ${JSON.stringify(body).slice(0, 300)}`);
    return;
  }
  const auth = { authorization: `Bearer ${body.data.accessToken}` };
  console.log(`logged in as @${body.data.user.username}`);

  const cases = [
    { name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello', 'utf8') },
    { name: 'sheet.csv', type: 'text/csv', bytes: Buffer.from('a,b\n1,2\n', 'utf8') },
    { name: 'photo.png', type: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) },
    { name: 'clip.mp4', type: 'video/mp4', bytes: Buffer.alloc(512, 3) },
    { name: 'doc.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.4\n', 'utf8') },
    { name: 'archive.zip', type: 'application/zip', bytes: Buffer.from('PK', 'binary') },
    // Deliberately outside the allow list — must be refused, not stored.
    { name: 'evil.html', type: 'text/html', bytes: Buffer.from('<b>x</b>', 'utf8') },
    { name: 'no-extension', type: 'text/plain', bytes: Buffer.from('x', 'utf8') },
  ];

  for (const c of cases) {
    const form = new FormData();
    form.append('files', new Blob([c.bytes], { type: c.type }), c.name);
    const res = await fetch(`${base}/uploads/files`, { method: 'POST', headers: auth, body: form });
    const text = await res.text();
    const mark = res.ok ? 'PASS' : 'FAIL';
    console.log(`  ${mark} ${c.name.padEnd(14)} ${c.type.padEnd(18)} -> ${res.status} ${text.slice(0, 120)}`);
  }

  // Multi-file in one request, which is what the picker does when you select
  // several files at once.
  const multi = new FormData();
  for (const c of cases.slice(0, 3)) {
    multi.append('files', new Blob([c.bytes], { type: c.type }), c.name);
  }
  const mres = await fetch(`${base}/uploads/files`, { method: 'POST', headers: auth, body: multi });
  const mbody = await mres.text();
  console.log(`  ${mres.ok ? 'PASS' : 'FAIL'} multi-file (3)   -> ${mres.status} ${mbody.slice(0, 160)}`);
}

await main();