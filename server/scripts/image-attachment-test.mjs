/**
 * Confirms the fix end to end: an image can be uploaded, attached to a post,
 * and served back inline — the path that was broken before.
 *
 *   node scripts/image-attachment-test.mjs
 */
import { PrismaClient } from '@prisma/client';

const base = process.env.TEST_BASE ?? 'http://localhost:4000/api';
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

try {
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: process.env.TEST_EMAIL ?? 'admin@nimbus.dev',
      password: process.env.TEST_PASSWORD ?? 'Admin@1234',
    }),
  }).then((r) => r.json());
  const auth = { authorization: `Bearer ${login.data.accessToken}` };

  // 1x1 transparent PNG.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const form = new FormData();
  form.append('files', new Blob([png], { type: 'image/png' }), 'pixel.png');
  const up = await fetch(`${base}/uploads/files`, { method: 'POST', headers: auth, body: form });
  const att = (await up.json())?.data?.files?.[0];
  check('image uploads', up.status === 201 && Boolean(att?.id), `status ${up.status}`);
  if (!att?.id) process.exit(1);

  const cats = await fetch(`${base}/categories`, { headers: auth }).then((r) => r.json());
  const filesCat = cats.data.find((c) => c.slug === 'files');

  const created = await fetch(`${base}/posts`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'ทดสอบแนบรูปภาพ',
      content: 'โพสต์ชั่วคราวสำหรับตรวจสอบว่าแนบรูปภาพได้และแสดงผลในหน้าบทความ',
      categoryId: filesCat?.id ?? null,
      attachmentIds: [att.id],
    }),
  }).then((r) => r.json());
  const post = created?.data?.post ?? created?.data;
  check('post accepts the image', Boolean(post?.slug));
  if (!post?.slug) process.exit(1);

  check('attachment is on the post', post.attachments?.length === 1, JSON.stringify(post.attachments));

  const fileUrl = `${base}/posts/${post.slug}/attachments/${att.id}`;
  const res = await fetch(fileUrl, { headers: auth });
  const buf = Buffer.from(await res.arrayBuffer());
  check('served inline as image/png', (res.headers.get('content-disposition') ?? '').startsWith('inline') && res.headers.get('content-type') === 'image/png');
  check('bytes match the upload', buf.equals(png), `${buf.length} vs ${png.length}`);

  console.log(`\n${pass}/${pass + fail} checks passed`);
  console.log(`\nleftover test post: ${post.slug} — rerun purge-test-posts.mjs to drop it`);
} finally {
  await prisma.$disconnect();
}
process.exit(fail ? 1 : 0);