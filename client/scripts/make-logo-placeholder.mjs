/**
 * Writes neutral placeholders for the brand artwork so the image paths always
 * resolve while the real files are still pending.
 *
 *   node scripts/make-logo-placeholder.mjs
 *
 * Produces two assets:
 *   public/logo/wksl-mark.png      square monogram for the 32px header chip
 *   public/logo/wksl-wordmark.png  wide wordmark for og:image / auth pages
 *
 * Overwrite either file with the real artwork; nothing else has to change.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'public', 'logo');
fs.mkdirSync(outDir, { recursive: true });

// --- minimal PNG encoder (zlib only, same approach as generate-icons.mjs) ---

function crc32(buf) {
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());

  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  // Prefix every scanline with filter byte 0 (none).
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- draw ------------------------------------------------------------------

// 5x7 bitmap font, enough for the placeholder wording.
const FONT = {
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const GLYPH_W = 5;
const GLYPH_H = 7;

/** One canvas buffer, reused for both assets at their own sizes. */
const STRIDE = 1024;
const px = Buffer.alloc(STRIDE * 512 * 4);

/**
 * Copy the top-left `width` x `height` block out of the fixed-stride canvas.
 * A plain subarray would fold the padding into the image once width < STRIDE.
 */
function pack(width, height) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = y * STRIDE * 4;
    px.copy(out, y * width * 4, from, from + width * 4);
  }
  return out;
}

function render(width, height, lines) {
  px.fill(0);

  // Dark slate backdrop with a soft vertical gradient.
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const r = Math.round(12 + t * 18);
    const g = Math.round(20 + t * 24);
    const b = Math.round(32 + t * 32);
    for (let x = 0; x < width; x++) {
      const o = (y * STRIDE + x) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }

  // Centre the whole block of lines vertically.
  const gap = 1; // blank cells between lines
  const cell = lines[0].cell;
  const blockH = lines.length * GLYPH_H * cell + (lines.length - 1) * gap * cell;
  let top = Math.round((height - blockH) / 2);

  for (const line of lines) {
    const textW = line.text.length * (GLYPH_W + 1) * cell - cell;
    const left = Math.round((width - textW) / 2);
    drawText(line.text, left, top, cell, line.metal);
    top += GLYPH_H * cell + gap * cell;
  }

  return encodePng(width, height, pack(width, height));
}

function drawText(text, originX, originY, cell, metal) {
  let cx = originX;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' '];
    glyph.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < cell; dy++) {
          for (let dx = 0; dx < cell; dx++) {
            const x = cx + rx * cell + dx;
            const y = originY + ry * cell + dy;
            // Vertical banding fakes a brushed-metal sheen.
            const shade = 0.55 + 0.45 * Math.cos(y * 0.055);
            const o = (y * STRIDE + x) * 4;
            px[o] = Math.min(255, Math.round(metal[0] * shade));
            px[o + 1] = Math.min(255, Math.round(metal[1] * shade));
            px[o + 2] = Math.min(255, Math.round(metal[2] * shade));
            px[o + 3] = 255;
          }
        }
      });
    });
    cx += (GLYPH_W + 1) * cell;
  }
}

// --- assets ----------------------------------------------------------------

/** The brand name every placeholder is rendered from. */
const BRAND = 'WKSL';

/**
 * Largest cell size at which `text` still fits inside `width` with a margin, so
 * the artwork never has to be re-tuned by hand when the name changes.
 */
function fitCell(width, text, fill) {
  return Math.floor((width * fill + 1) / (text.length * (GLYPH_W + 1)));
}

// Wide wordmark, used for og:image and the sign-in / account pages.
const wordmark = path.join(outDir, 'wksl-wordmark.png');
fs.writeFileSync(
  wordmark,
  render(1024, 512, [{ text: BRAND, cell: fitCell(1024, BRAND, 0.8), metal: [235, 240, 246] }]),
);
console.log(`wordmark written: ${wordmark} (1024x512)`);

// Square monogram for the 32px header chip. Four letters is tight at that size,
// so the cell is fitted to the canvas instead of guessed.
const monogram = path.join(outDir, 'wksl-mark.png');
fs.writeFileSync(
  monogram,
  render(512, 512, [{ text: BRAND, cell: fitCell(512, BRAND, 0.9), metal: [235, 240, 246] }]),
);
console.log(`monogram written: ${monogram} (512x512)`);