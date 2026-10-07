/**
 * Generates the PWA icon set as real PNG files with no native dependencies.
 *
 *   node scripts/generate-icons.mjs
 *
 * Renders the WKSL mark into an RGBA buffer and encodes it as PNG using
 * only `zlib`, which node ships with.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

// --- minimal PNG encoder ----------------------------------------------------

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
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
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

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

// --- drawing ----------------------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Signed distance to a rounded rectangle centred at (cx, cy). */
function sdRoundRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Signed distance to a line segment. */
function sdSeg(px, py, ax, ay, bx, by) {
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp01(((px - ax) * bax + (py - ay) * bay) / (bax * bax + bay * bay));
  return Math.hypot(px - ax - bax * h, py - ay - bay * h);
}

/**
 * Signed distance to the W mark: four strokes with round joins, drawn on the
 * same 512 grid as `public/favicon.svg` so every surface shows the same glyph.
 * Taking the minimum across the segments anti-aliases cleanly.
 */
function sdW(px, py, cx, cy, s) {
  // Glyph points in design space (512x512, centre 256,256).
  const pts = [
    [128, 144],
    [208, 368],
    [256, 240],
    [304, 368],
    [384, 144],
  ];

  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    d = Math.min(
      d,
      sdSeg(px, py, cx + (ax - 256) * s, cy + (ay - 256) * s, cx + (bx - 256) * s, cy + (by - 256) * s),
    );
  }

  // Stroke half-width matches the 64-unit stroke of the SVG favicon.
  return d - 32 * s;
}

/**
 * Metal ramp for the chrome look. The banding is what reads as a reflection:
 * bright sky at the top, a dark horizon, a second highlight, shadowed steel
 * underneath. Values are sampled per pixel so the bands stay crisp at 32px.
 */
const METAL_STOPS = [
  [0.0, [255, 255, 255]],
  [0.12, [236, 241, 246]],
  [0.26, [150, 161, 175]],
  [0.42, [248, 251, 253]],
  [0.56, [128, 140, 154]],
  [0.72, [206, 214, 222]],
  [0.88, [96, 107, 120]],
  [1.0, [58, 66, 76]],
];

function metalAt(t) {
  const k = clamp01(t);
  for (let i = 0; i < METAL_STOPS.length - 1; i++) {
    const [p0, c0] = METAL_STOPS[i];
    const [p1, c1] = METAL_STOPS[i + 1];
    if (k >= p0 && k <= p1) return mix(c0, c1, (k - p0) / (p1 - p0));
  }
  return METAL_STOPS[METAL_STOPS.length - 1][1];
}

function render(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size / 512; // design grid is 512x512

  // Maskable icons must keep content inside a 80% safe zone.
  const scale = maskable ? 0.72 : 0.92;
  const cx = size / 2;
  const cy = size / 2;
  // The glyph is nudged up so the extrusion and cast shadow have room below.
  const glyph = s * scale * 0.94;

  const radius = maskable ? 0 : 112 * s;
  const depth = 16 * glyph;
  const cyOffset = -10 * glyph;

  // Background: a cool dark gradient, lit from the top right.
  const bgInner = [43, 58, 74];
  const bgMid = [16, 24, 32];
  const bgOuter = [5, 7, 10];

  // The W spans 144..368 vertically, so metal brightness is mapped to that
  // range rather than the whole canvas.
  const top = 144;
  const bottom = 368;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      let bgAlpha = 1;
      if (!maskable) {
        const d = sdRoundRect(px, py, cx, cy, size / 2, size / 2, radius);
        bgAlpha = clamp01(0.5 - d);
      }

      // Radial background falloff from the top-right.
      const gx = (px / size - 0.72) * 1.25;
      const gy = (py / size - 0.18) * 1.25;
      const gd = clamp01(Math.sqrt(gx * gx + gy * gy));
      let r;
      let g;
      let b;
      if (gd < 0.55) {
        [r, g, b] = mix(bgInner, bgMid, gd / 0.55);
      } else {
        [r, g, b] = mix(bgMid, bgOuter, (gd - 0.55) / 0.45);
      }

      // How far along the glyph's vertical span this pixel sits.
      const span = clamp01((py / glyph - cyOffset - top) / (bottom - top));
      const metal = metalAt(span);

      // Extrusion: several copies stepped down-right, painted back to front, so
      // the letter reads as a solid block with a lit top face rather than a flat
      // outline. Each step is thinner than the one behind it.
      for (let step = 5; step >= 1; step--) {
        const ox = step * 3.4 * glyph;
        const oy = step * depth;
        const sideAlpha = clamp01(0.5 - sdW(px - ox, py - oy, cx, cy + cyOffset, glyph));
        if (sideAlpha <= 0) continue;

        // Sides run darker as they recede from the light.
        const k = step / 5;
        const side = mix([96, 106, 118], [26, 31, 38], k);
        r = lerp(r, side[0], sideAlpha);
        g = lerp(g, side[1], sideAlpha);
        b = lerp(b, side[2], sideAlpha);
      }

      // Hard cast shadow on the backdrop, thrown down and to the left like the
      // reference. Drawn before the letter so it never covers the metal.
      {
        const sh = clamp01(0.5 - sdW(px + 26 * glyph, py - 34 * glyph, cx, cy + cyOffset, glyph * 1.16));
        if (sh > 0) {
          r = lerp(r, 0, sh * 0.62);
          g = lerp(g, 0, sh * 0.62);
          b = lerp(b, 0, sh * 0.62);
        }
      }

      // Front face.
      const frontAlpha = clamp01(0.5 - sdW(px, py, cx, cy + cyOffset, glyph));
      if (frontAlpha > 0) {
        r = lerp(r, metal[0], frontAlpha);
        g = lerp(g, metal[1], frontAlpha);
        b = lerp(b, metal[2], frontAlpha);

        // Bevel: white catching the top, near-black at the bottom.
        if (span < 0.42) {
          const k = 0.95 * (1 - span / 0.42) * frontAlpha;
          r = lerp(r, 255, k);
          g = lerp(g, 255, k);
          b = lerp(b, 255, k);
        } else if (span > 0.6) {
          const k = 0.35 * ((span - 0.6) / 0.4) * frontAlpha;
          r = lerp(r, 11, k);
          g = lerp(g, 15, k);
          b = lerp(b, 20, k);
        }
      }

      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(bgAlpha * 255);
    }
  }

  return encodePng(size, size, buf);
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
  { file: 'favicon-32.png', size: 32, maskable: false },
];

for (const t of targets) {
  const png = render(t.size, { maskable: t.maskable });
  fs.writeFileSync(path.join(outDir, t.file), png);
  console.log(`✓ ${t.file} (${t.size}x${t.size}, ${(png.length / 1024).toFixed(1)} KB)`);
}