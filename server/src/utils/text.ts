import crypto from 'node:crypto';

/**
 * Thai romanisation. Good enough to produce readable, stable slugs — it is not
 * a full RTGS implementation, but it is deterministic, which matters more:
 * a random fallback made the same word produce two different slugs inside one
 * request, and a post could never be looked up by a stable URL.
 */
const THAI_CHARS: Record<string, string> = {
  // consonants
  'ก': 'k', 'ข': 'kh', 'ฃ': 'kh', 'ค': 'k', 'ฅ': 'kh', 'ฆ': 'kh', 'ง': 'ng',
  'จ': 'ch', 'ฉ': 'ch', 'ช': 'ch', 'ซ': 's', 'ฌ': 'ch', 'ญ': 'y', 'ฎ': 'd', 'ฏ': 't',
  'ฐ': 'th', 'ฑ': 'th', 'ฒ': 'th', 'ณ': 'n', 'ด': 'd', 'ต': 't', 'ถ': 'th', 'ท': 'th',
  'ธ': 'th', 'น': 'n', 'บ': 'b', 'ป': 'p', 'ผ': 'ph', 'ฝ': 'f', 'พ': 'ph', 'ฟ': 'f',
  'ภ': 'ph', 'ม': 'm', 'ย': 'y', 'ร': 'r', 'ฤ': 'rue', 'ล': 'l', 'ฦ': 'lue', 'ว': 'w',
  'ศ': 's', 'ษ': 's', 'ส': 's', 'ห': 'h', 'ฬ': 'l', 'อ': 'o', 'ฮ': 'h',
  // vowels and marks
  'ะ': 'a', 'ั': '', 'า': 'a', 'ำ': 'am', 'ิ': 'i', 'ี': 'i', 'ึ': 'ue', 'ื': 'ue',
  'ู': 'ue', 'ฺ': '', 'เ': 'e', 'แ': 'ae', 'โ': 'o', 'ใ': 'ai', 'ไ': 'ai', 'ๅ': 'f',
  '็': 'e', 'ํ': 'n', 'ๆ': '', '์': '', 'ฯ': '',
  // tone marks carry no consonant of their own
  '่': '', '้': '', '๊': '', '๋': '',
};

/**
 * `ไ` and `ใ` are written before `ฟ` but pronounced as a diphthong on it, so
 * the pair is romanised as one unit: ไฟล์ → fail, not aifl.
 */
const THAI_SILENT_PREFIX: Record<string, string> = { 'ไฟ': 'fai', 'ใฟ': 'fai' };

/** Stable across processes — unlike a random suffix, the same input always
 *  produces the same slug, so lookups and dedupe keep working. */
function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/** Replaces Thai runs with their romanisation, leaving other scripts alone. */
function romanise(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const pair = input.slice(i, i + 2);
    if (THAI_SILENT_PREFIX[pair]) {
      out += THAI_SILENT_PREFIX[pair];
      i++;
      continue;
    }
    const ch = input[i];
    out += THAI_CHARS[ch] ?? ch;
  }
  return out;
}

export function slugify(input: string): string {
  const base = romanise(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip the accents NFKD splits off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');

  if (base) return base;
  // Nothing romanisable (pure CJK, emoji, symbols): still needs to be stable.
  return `item-${stableHash(input)}`;
}

/** Appends -2, -3 ... until `exists` returns false. */
export async function uniqueSlug(
  desired: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let candidate = desired;
  let n = 2;
  while (await exists(candidate)) {
    candidate = `${desired}-${n++}`;
  }
  return candidate;
}

export function estimateReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function excerptFrom(content: string, max = 180): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max).trimEnd()}…` : plain;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Short random id, used for filenames and similar opaque values. */
export function randomToken(bytes = 6): string {
  return crypto.randomBytes(bytes).toString('hex');
}
