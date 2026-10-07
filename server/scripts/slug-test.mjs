/**
 * Unit checks for slug generation. The Thai cases matter most: a random
 * fallback once made `slugify` return two different values for the same input
 * in a single request, which broke creating any post with a non-Latin tag.
 *
 * Usage: node scripts/slug-test.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { slugify, excerptFrom, estimateReadMinutes } = await import(
  pathToFileURL(path.resolve(here, '..', 'src', 'utils', 'text.ts')).href
);

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

console.log('\n\x1b[1m▸ Determinism\x1b[0m');
for (const input of ['ภาษาไทย', 'ไฟล์', 'Real-Time Chat', 'ข้อมูล', 'สิ่งที่ดี', '日本', '🎉']) {
  check(`"${input}" is stable`, slugify(input) === slugify(input), slugify(input));
}

console.log('\n\x1b[1m▸ Shape\x1b[0m');
check('latin keeps words and dashes', slugify('Real-Time Chat') === 'real-time-chat', slugify('Real-Time Chat'));
check('accents are folded', slugify('Café Déjà Vu') === 'cafe-deja-vu', slugify('Café Déjà Vu'));
check('output is url safe', /^[a-z0-9-]+$/.test(slugify('ทดสอบ ระบบ/ไฟล์ 123')), slugify('ทดสอบ ระบบ/ไฟล์ 123'));
check('no trailing dash after truncation', !slugify('ภาษาไทยที่ยาวมากมากมากมากมาก').endsWith('-'), slugify('ภาษาไทยที่ยาวมากมากมากมากมาก'));
check('thai romanises to readable ascii', /^[a-z]+$/.test(slugify('ภาษาไทย')), slugify('ภาษาไทย'));
check('untransliterable falls back to a hash prefix', slugify('日本語').startsWith('item-'), slugify('日本語'));

console.log('\n\x1b[1m▸ Uniqueness within a request\x1b[0m');
const tagNames = ['ไฟล์', 'การออกแบบ', 'ข้อมูล'];
const slugs = tagNames.map(slugify);
check('distinct tags give distinct slugs', new Set(slugs).size === tagNames.length, slugs.join(', '));
check('each tag name round-trips to its own slug', tagNames.every((n) => slugs.find((s) => s === slugify(n)) === slugify(n)));

console.log('\n\x1b[1m▸ Excerpt\x1b[0m');
check('markdown syntax stripped', !excerptFrom('# Title\n\nSome **bold** text.').includes('**'), excerptFrom('# Title\n\nSome **bold** text.'));
check('long content truncated', excerptFrom('x'.repeat(400)).length <= 181);
check('short content untouched', excerptFrom('สั้น ๆ') === 'สั้น ๆ');

console.log('\n\x1b[1m▸ Read time\x1b[0m');
check('at least one minute', estimateReadMinutes('') === 1);
check('rounds to nearest', estimateReadMinutes('word '.repeat(250)) === 1, String(estimateReadMinutes('word '.repeat(250))));
check('a long piece rounds up to two', estimateReadMinutes('word '.repeat(350)) === 2, String(estimateReadMinutes('word '.repeat(350))));

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
