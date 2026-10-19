/**
 * End-to-end check for video attachments: upload, attach to a post, then
 * confirm the server answers Range requests and serves the clip inline.
 *
 *   node scripts/video-test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PrismaClient } from '@prisma/client';

const base = process.env.TEST_BASE ?? 'http://localhost:4000/api';
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
function check(label, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  // 1. log in
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@nimbus.dev', password: 'Admin@1234' }),
  }).then((r) => r.json());
  const token = login?.data?.accessToken;
  check('admin logs in', Boolean(token));
  if (!token) return;
  const auth = { authorization: `Bearer ${token}` };

  // 2. upload an mp4
  const bytes = Buffer.alloc(2000, 7);
  const form = new FormData();
  form.append('files', new Blob([bytes], { type: 'video/mp4' }), 'clip-test.mp4');
  const up = await fetch(`${base}/uploads/files`, { method: 'POST', headers: auth, body: form }).then((r) => r.json());
  const att = up?.data?.files?.[0];
  check('mp4 upload accepted', Boolean(att?.id), JSON.stringify(up).slice(0, 200));
  if (!att?.id) return;
  check('stored as video/mp4', att.mimeType === 'video/mp4', att.mimeType);

  // 3. the Video category exists
  const cats = await fetch(`${base}/categories`, { headers: auth }).then((r) => r.json());
  const video = cats?.data?.find((c) => c.slug === 'video');
  const files = cats?.data?.find((c) => c.slug === 'files');
  check('category "video" exists', Boolean(video));
  check('category "files" exists', Boolean(files));

  // 4. attach it to a post
  const created = await fetch(`${base}/posts`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'ทดสอบการเล่นวีดีโอและ Range request',
      content: 'โพสต์ชั่วคราวสำหรับตรวจสอบว่าเครื่องเล่นวีดีโอและการเลื่อนเวลาทำงาน',
      categoryId: video?.id ?? null,
      attachmentIds: [att.id],
    }),
  }).then((r) => r.json());
  const post = created?.data?.post ?? created?.data;
  check('post created with the clip', Boolean(post?.slug), JSON.stringify(created).slice(0, 200));
  if (!post?.slug) return;

  const fileUrl = `${base}/posts/${post.slug}/attachments/${att.id}`;

  // 5. plain GET is served inline with the real type
  const whole = await fetch(fileUrl, { headers: auth });
  check('full request returns 200', whole.status === 200, String(whole.status));
  check('Content-Type is video/mp4', whole.headers.get('content-type') === 'video/mp4', whole.headers.get('content-type'));
  check('served inline', (whole.headers.get('content-disposition') ?? '').startsWith('inline'));
  check('Accept-Ranges advertised', whole.headers.get('accept-ranges') === 'bytes');
  check('full body length correct', (await whole.arrayBuffer()).byteLength === 2000);

  // 6. Range request — the part that makes seeking work
  const partial = await fetch(fileUrl, { headers: { ...auth, range: 'bytes=100-199' } });
  check('range request returns 206', partial.status === 206, String(partial.status));
  check('Content-Range header correct', partial.headers.get('content-range') === 'bytes 100-199/2000', partial.headers.get('content-range'));
  const partialBody = Buffer.from(await partial.arrayBuffer());
  check('partial body is 100 bytes', partialBody.length === 100, String(partialBody.length));
  check('partial bytes match the source', partialBody.equals(bytes.subarray(100, 200)));

  // 7. suffix range (the `bytes=-100` form browsers also send)
  const suffix = await fetch(fileUrl, { headers: { ...auth, range: 'bytes=-100' } });
  check('suffix range returns 206', suffix.status === 206, String(suffix.status));
  check('suffix range is the last 100 bytes', Buffer.from(await suffix.arrayBuffer()).equals(bytes.subarray(1900)));

  // 8. an unsatisfiable range is refused rather than served wrong
  const bad = await fetch(fileUrl, { headers: { ...auth, range: 'bytes=99999-' } });
  check('out-of-range returns 416', bad.status === 416, String(bad.status));

  // 9. non-video is still forced to download
  const asDownload = await fetch(`${fileUrl}?download=1`, { headers: auth });
  check('?download=1 forces attachment', (asDownload.headers.get('content-disposition') ?? '').startsWith('attachment'));
  await asDownload.arrayBuffer();

  console.log(`\n${pass}/${pass + fail} checks passed`);
  console.log(`\ntest post left behind: ${post.slug} (delete it from the admin page)`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
process.exit(fail > 0 ? 1 : 0);