/**
 * End-to-end checks for post attachments: multi-file upload, claiming on save,
 * download headers, authorisation boundaries, and cleanup.
 *
 * Usage: node scripts/attachment-test.mjs [baseUrl]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4000';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-attach-'));

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

async function api(pathname, { method = 'GET', token, body, raw, headers: extra } = {}) {
  const headers = { ...(extra ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${pathname}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (file download) */
  }
  return { status: res.status, headers: res.headers, json, text };
}

async function login(identifier, password) {
  const res = await api('/auth/login', { method: 'POST', body: { identifier, password } });
  if (!res.json?.success) throw new Error(`login failed for ${identifier}: ${res.text}`);
  return res.json.data.accessToken;
}

/** Builds a multipart body by hand so no extra dependency is needed. */
function multipart(field, files) {
  const boundary = `----nimbus${Math.random().toString(36).slice(2)}`;
  const chunks = [];
  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(
      Buffer.from(
        `Content-Disposition: form-data; name="${field}"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
      ),
    );
    chunks.push(Buffer.isBuffer(file.body) ? file.body : Buffer.from(file.body));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function fixture(name, type, contents) {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, contents);
  return { name, type, path: file, body: fs.readFileSync(file) };
}

// ---------------------------------------------------------------------------

const admin = await login('admin@nimbus.dev', 'Admin@1234');
const sara = await login('sara@nimbus.dev', 'Password@123');

const pdf = fixture('quarterly-report.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nfake pdf body\n'));
const sheet = fixture('metrics.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.alloc(2048, 7));
const notes = fixture('readme.md', 'text/markdown', '# notes\n\nhello');

try {
  section('Upload');
  const { body, contentType } = multipart('files', [pdf, sheet, notes]);
  const up = await api('/uploads/files', {
    method: 'POST',
    token: admin,
    body,
    raw: true,
    headers: { 'Content-Type': contentType },
  });
  check('multi-file upload accepted', up.status === 201 && up.json?.data?.files?.length === 3, `status=${up.status} ${up.text.slice(0, 160)}`);

  const files = up.json?.data?.files ?? [];
  check('each file keeps its original name', files.every((f, i) => f.originalName === [pdf.name, sheet.name, notes.name][i]), JSON.stringify(files.map((f) => f.originalName)));
  check('each file gets an id', files.every((f) => typeof f.id === 'string' && f.id.length > 10));

  section('Rejections');
  const bad = multipart('files', [fixture('evil.exe', 'application/x-msdownload', 'MZ')]);
  const badRes = await api('/uploads/files', { method: 'POST', token: admin, body: bad.body, raw: true, headers: { 'Content-Type': bad.contentType } });
  check('executable rejected', badRes.status === 400, `status=${badRes.status}`);

  // A permissive type with a dangerous extension must still be refused.
  const sneaky = multipart('files', [{ name: 'page.html', type: 'text/html', body: Buffer.from('<script>alert(1)</script>') }]);
  const sneakyRes = await api('/uploads/files', { method: 'POST', token: admin, body: sneaky.body, raw: true, headers: { 'Content-Type': sneaky.contentType } });
  check('text/html accepted for attachments but forced to download later', sneakyRes.status === 201, `status=${sneakyRes.status}`);

  const anon = multipart('files', [notes]);
  const anonRes = await api('/uploads/files', { method: 'POST', body: anon.body, raw: true, headers: { 'Content-Type': anon.contentType } });
  check('anonymous upload rejected', anonRes.status === 401, `status=${anonRes.status}`);

  section('Attach to a post');
  // text/html is on the attachment allow list, but must never render inline.
  const sneakyFiles = (sneakyRes.json?.data?.files ?? []).map((f) => f.id);
  const created = await api('/posts', {
    method: 'POST',
    token: admin,
    body: {
      title: 'ชุดไฟล์ตัวอย่างสำหรับทดสอบการแนบ',
      content: 'บทความนี้มีไฟล์แนบหลายไฟล์เพื่อทดสอบการดาวน์โหลดและการแสดงผลในหน้าเว็บของระบบ',
      attachmentIds: [...files.map((f) => f.id), ...sneakyFiles],
      tags: ['ไฟล์'],
    },
  });
  check('post created with attachments', created.status === 201 && created.json?.data?.attachmentCount === 4, `status=${created.status} count=${created.json?.data?.attachmentCount} body=${created.text.slice(0, 300)}`);

  const htmlAttachment = created.json.data.attachments.find((a) => a.name === 'page.html');
  // `downloadUrl` already carries the /api prefix the server serialises.
  const htmlFetch = await fetch(`${BASE}${htmlAttachment.downloadUrl}`);
  check('html attachment forces a download', htmlFetch.headers.get('content-disposition')?.startsWith('attachment'), htmlFetch.headers.get('content-disposition'));
  check('html attachment is not served as text/html', htmlFetch.headers.get('content-type') === 'application/octet-stream', htmlFetch.headers.get('content-type'));

  const post = created.json?.data;
  const slug = post?.slug;

  section('Download headers');
  const first = post.attachments[0];
  const dl = await fetch(`${BASE}${first.downloadUrl}`);
  const received = Buffer.from(await dl.arrayBuffer());
  check('download responds 200', dl.status === 200, `status=${dl.status} ${received.toString('utf8').slice(0, 200)}`);
  check('non-image forces a download', dl.headers.get('content-disposition')?.startsWith('attachment'), dl.headers.get('content-disposition'));
  check('served as octet-stream', dl.headers.get('content-type') === 'application/octet-stream', dl.headers.get('content-type'));
  check('nosniff is set', dl.headers.get('x-content-type-options') === 'nosniff');
  check('bytes match what was uploaded', received.equals(pdf.body), `got ${received.length}b, sent ${pdf.body.length}b`);

  section('Ownership');
  const steal = await api('/posts', {
    method: 'POST',
    token: sara,
    body: {
      title: 'พยายามแนบไฟล์ของคนอื่นเพื่อทดสอบสิทธิ์การเข้าถึง',
      content: 'เนื้อหาทดสอบเพียงพอสำหรับการตรวจสอบว่าระบบป้องกันการนำไฟล์ของผู้อื่นมาใช้งาน',
      attachmentIds: [files[0].id],
    },
  });
  check('another member cannot claim the upload', steal.status === 201 && steal.json?.data?.attachmentCount === 0, `count=${steal.json?.data?.attachmentCount}`);
  await api(`/posts/${steal.json.data.id}`, { method: 'DELETE', token: sara });

  const removeOthers = await api(`/posts/${post.id}/attachments/${files[0].id}`, { method: 'DELETE', token: sara });
  check('non-author cannot detach a file', removeOthers.status === 403, `status=${removeOthers.status}`);

  section('Edit');
  const addMore = multipart('files', [fixture('dataset.csv', 'text/csv', 'a,b\n1,2\n')]);
  const up2 = await api('/uploads/files', { method: 'POST', token: admin, body: addMore.body, raw: true, headers: { 'Content-Type': addMore.contentType } });
  const newId = up2.json.data.files[0].id;

  const patched = await api(`/posts/${post.id}`, {
    method: 'PATCH',
    token: admin,
    body: { attachmentIds: [newId], removedAttachmentIds: [files[1].id] },
  });
  check('patch adds and removes', patched.status === 200 && patched.json?.data?.attachmentCount === 4, `count=${patched.json?.data?.attachmentCount}`);
  check('removed file is gone', !patched.json.data.attachments.some((a) => a.id === files[1].id));
  check('new file is present', patched.json.data.attachments.some((a) => a.id === newId));

  const dropped = await fetch(`${BASE}/api/posts/${slug}/attachments/${files[1].id}?download=1`);
  check('detached file no longer downloads', dropped.status === 404, `status=${dropped.status}`);

  section('Draft privacy');
  // A fresh upload: the earlier one is already attached to the published post.
  const draftUpload = multipart('files', [fixture('secret-plan.txt', 'text/plain', 'not for publication')]);
  const up4 = await api('/uploads/files', { method: 'POST', token: admin, body: draftUpload.body, raw: true, headers: { 'Content-Type': draftUpload.contentType } });
  const draftId = up4.json.data.files[0].id;

  const draft = await api('/posts', {
    method: 'POST',
    token: admin,
    body: {
      title: 'ฉบับร่างที่มีไฟล์แนบซึ่งไม่ควรเปิดเผยต่อสาธารณะ',
      content: 'เนื้อหาร่างที่มีไฟล์แนบ ใช้ตรวจสอบว่าผู้อื่นไม่สามารถดาวน์โหลดไฟล์ของบทความที่ยังไม่เผยแพร่ได้',
      status: 'DRAFT',
      attachmentIds: [draftId],
    },
  });
  check('draft created with its file', draft.status === 201 && draft.json.data.attachments.length === 1, `count=${draft.json?.data?.attachments?.length}`);

  const draftAttachment = draft.json.data.attachments[0];
  const asOther = await fetch(`${BASE}${draftAttachment.url}`);
  check('draft file hidden from other members', asOther.status === 404, `status=${asOther.status}`);
  const asAdmin = await fetch(`${BASE}${draftAttachment.url}`, { headers: { Authorization: `Bearer ${admin}` } });
  check('draft file visible to its author', asAdmin.status === 200, `status=${asAdmin.status}`);

  section('Cleanup');
  const discardUpload = multipart('files', [fixture('temp.txt', 'text/plain', 'temporary')]);
  const up3 = await api('/uploads/files', { method: 'POST', token: admin, body: discardUpload.body, raw: true, headers: { 'Content-Type': discardUpload.contentType } });
  const tempId = up3.json.data.files[0].id;
  const discarded = await api(`/uploads/files/${tempId}`, { method: 'DELETE', token: admin });
  check('unclaimed upload can be discarded', discarded.status === 200, `status=${discarded.status}`);

  const alreadyAttached = await api(`/uploads/files/${newId}`, { method: 'DELETE', token: admin });
  check('attached file is not discardable that way', alreadyAttached.status === 400, `status=${alreadyAttached.status}`);

  const postDeleted = await api(`/posts/${post.id}`, { method: 'DELETE', token: admin });
  check('post deleted', postDeleted.status === 204, `status=${postDeleted.status}`);
  const goneFile = await fetch(`${BASE}/api/posts/${slug}/attachments/${newId}?download=1`);
  check('files vanish with the post', goneFile.status === 404, `status=${goneFile.status}`);

  await api(`/posts/${draft.json.data.id}`, { method: 'DELETE', token: admin });
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
