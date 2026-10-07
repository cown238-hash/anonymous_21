/**
 * Smoke test for image uploads: posts a small PNG as multipart/form-data and
 * verifies the API returns a `/uploads/...` URL that is actually servable.
 *
 *   node scripts/upload-test.mjs
 */
import { Buffer } from 'node:buffer';

const API = 'http://localhost:4000';

// 1x1 transparent PNG
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function login(identifier, password) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`login failed: ${json.error?.message}`);
  return json.data.accessToken;
}

const results = [];
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const token = await login('admin@nimbus.dev', 'Admin@1234');

function buildForm(buffer, filename, type) {
  const boundary = `----nimbus${Date.now().toString(16)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${type}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    body: Buffer.concat([head, buffer, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// 1. valid PNG
{
  const { body, contentType } = buildForm(Buffer.from(PNG_BASE64, 'base64'), 'pixel.png', 'image/png');
  const res = await fetch(`${API}/api/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
  });
  const json = await res.json();
  check('accepts a PNG upload', res.status === 201 && json.success, json.data?.url ?? json.error?.message);

  if (json.data?.url) {
    const get = await fetch(`${API}${json.data.url}`);
    const type = get.headers.get('content-type') ?? '';
    check('uploaded file is served back', get.status === 200 && type.includes('image'), `${get.status} ${type}`);
  }
}

// 2. rejected mime type
{
  const { body, contentType } = buildForm(Buffer.from('#!/bin/sh\nrm -rf /', 'utf8'), 'evil.sh', 'application/x-sh');
  const res = await fetch(`${API}/api/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
  });
  const json = await res.json();
  check('rejects a non-image mime type', res.status === 400 && !json.success, json.error?.message);
}

// 3. requires authentication
{
  const { body, contentType } = buildForm(Buffer.from(PNG_BASE64, 'base64'), 'anon.png', 'image/png');
  const res = await fetch(`${API}/api/uploads/image`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  check('rejects anonymous uploads', res.status === 401, `status ${res.status}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);