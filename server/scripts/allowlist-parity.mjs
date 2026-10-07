/**
 * Guards the contract between the two attachment allow lists:
 *
 *   - `server/src/middleware/upload.ts` decides what may be stored.
 *   - `client/src/components/Attachments.tsx` decides what the file picker shows.
 *
 * If the picker offers a type the API rejects, the user picks a file and then
 * gets an error with no way forward. This check fails the build instead.
 *
 * Usage: node scripts/allowlist-parity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const server = read('server/src/middleware/upload.ts');
const client = read('client/src/components/Attachments.tsx');

/** Wildcards like `image/*` are not extensions and carry no extension name. */
const isExtension = (value) => value.startsWith('.') && !value.includes('*');

/** Extensions listed in the server's FILE_EXT set. */
function serverExtensions() {
  const block = /const FILE_EXT = new Set\(\[([\s\S]*?)\]\)/.exec(server);
  if (!block) throw new Error('could not find FILE_EXT in server/src/middleware/upload.ts');
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()));
}

/** Extensions listed in the client's MIME_ATTR join. */
function clientExtensions() {
  const block = /const MIME_ATTR = \[([\s\S]*?)\]\.join\(','\)/.exec(client);
  if (!block) throw new Error('could not find MIME_ATTR in client/src/components/Attachments.tsx');
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()));
}

const allowed = serverExtensions();
const offered = clientExtensions();

const clientOnly = [...offered].filter(isExtension).filter((e) => !allowed.has(e)).sort();
const serverOnly = [...allowed].filter((e) => !offered.has(e)).sort();

let failed = false;

if (clientOnly.length > 0) {
  failed = true;
  console.log('\x1b[31mFAIL\x1b[0m picker offers types the API would reject:');
  for (const ext of clientOnly) console.log(`        ${ext}`);
}

if (serverOnly.length > 0) {
  failed = true;
  console.log('\x1b[31mFAIL\x1b[0m API accepts types the picker hides:');
  for (const ext of serverOnly) console.log(`        ${ext}`);
}

if (failed) {
  console.log('\nKeep both lists in step, or narrow them until they match.');
  process.exit(1);
}

console.log(`\x1b[32mPASS\x1b[0m allow lists match (${allowed.size} extensions, client + server)`);
