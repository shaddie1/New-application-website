/**
 * Generates app icon, adaptive icon, splash screen and favicon
 * from apps/logo/logo.jpg using Sharp.
 *
 * Run from the repo root:
 *   node apps/mobile/scripts/make-assets.mjs
 */

import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');
const LOGO_PATH = join(ROOT, 'apps/logo/logo.jpg');
const ASSETS_DIR = join(ROOT, 'apps/mobile/assets');

mkdirSync(ASSETS_DIR, { recursive: true });

// ── Background colour matching the app dark theme ──────────────────────────
const BG = { r: 27, g: 24, b: 20, alpha: 1 }; // #1B1814

// ── Step 1: Remove the checkerboard background ─────────────────────────────
// The logo was exported as JPG over a transparency grid (grey/white checkers).
// We detect and erase near-neutral (low-saturation, high-brightness) pixels.
async function removeBackground(inputPath, targetSize) {
  const { data, info } = await sharp(inputPath)
    .resize(targetSize, targetSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = new Uint8Array(data);

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const avg = (r + g + b) / 3;
    // Saturation (simple 0-255 range)
    const sat = Math.max(r, g, b) - Math.min(r, g, b);

    if (sat < 30 && avg > 160) {
      // Neutral grey/white checker — fully transparent
      px[i + 3] = 0;
    } else if (sat < 55 && avg > 180) {
      // Edge anti-aliasing — partially transparent
      const t = (sat / 55);
      px[i + 3] = Math.round(t * t * 255);
    }
    // Otherwise: keep original alpha (opaque logo pixels)
  }

  return sharp(Buffer.from(px), {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
}

// ── Step 2: Composite logo on a solid background ───────────────────────────
async function makeIcon(logoBuf, canvasW, canvasH, logoSize, outPath) {
  const resized = await sharp(logoBuf)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: BG },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toFile(outPath);

  console.log(`✓ ${outPath.replace(ROOT, '')}`);
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log('Processing logo…');
const logoBuf = await removeBackground(LOGO_PATH, 1200);

// icon.png — 1024×1024, logo fills ~88% of the square
await makeIcon(logoBuf, 1024, 1024, 900, join(ASSETS_DIR, 'icon.png'));

// adaptive-icon.png — 1024×1024, logo fits in Android safe-zone (72%)
await makeIcon(logoBuf, 1024, 1024, 740, join(ASSETS_DIR, 'adaptive-icon.png'));

// splash.png — 1284×2778 (full-screen portrait), logo centred and large
await makeIcon(logoBuf, 1284, 2778, 1100, join(ASSETS_DIR, 'splash.png'));

// favicon.png — 48×48 for Expo web
await makeIcon(logoBuf, 48, 48, 42, join(ASSETS_DIR, 'favicon.png'));

console.log('\nAll assets written to apps/mobile/assets/');
