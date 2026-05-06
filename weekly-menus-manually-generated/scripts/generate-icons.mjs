/**
 * Generates minimal PNG icon files for the Brooklyn Kitchen PWA.
 * Produces solid-color squares at 192x192, 512x512, and 180x180 (apple-touch-icon).
 * No external dependencies — uses Node's built-in zlib.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir  = path.join(__dirname, '..', 'icons');

// ── CRC-32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function crcBuf(buf) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(crc32(buf), 0);
  return out;
}

// ── PNG chunk ─────────────────────────────────────────────────────────────────
function pngChunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, t, data, crcBuf(Buffer.concat([t, data]))]);
}

// ── Solid-colour RGB PNG ──────────────────────────────────────────────────────
function makePNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // colour type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  // One row: filter byte (0 = None) + RGB pixels
  const row = Buffer.alloc(1 + size * 3);
  row[0] = 0;
  for (let x = 0; x < size; x++) {
    row[1 + x * 3]     = r;
    row[2 + x * 3]     = g;
    row[3 + x * 3]     = b;
  }
  const rawData    = Buffer.concat(Array(size).fill(row));
  const compressed = deflateSync(rawData);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Generate ──────────────────────────────────────────────────────────────────
mkdirSync(iconsDir, { recursive: true });

// App green: #4a7c59  rgb(74, 124, 89)
const [r, g, b] = [74, 124, 89];

writeFileSync(path.join(iconsDir, 'icon-192.png'),        makePNG(192, r, g, b));
writeFileSync(path.join(iconsDir, 'icon-512.png'),        makePNG(512, r, g, b));
writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), makePNG(180, r, g, b));

console.log('✅  PWA icons generated in weekly-menus-manually-generated/icons/');
