/**
 * TapMenu marka ikonlarını üretir.
 * - Kare ikonlar: yalnızca mark (nokta + menü çizgileri), wordmark değil
 * - OG: tam wordmark (tapmenu-logo.png)
 * Kullanım: node scripts/generate-brand-icons.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const logoPath = path.join(root, "public/brand/tapmenu-logo.png");
const markPath = path.join(root, "public/brand/tapmenu-mark.png");
const appDir = path.join(root, "app");

const BRAND_BLUE = "#0ea5e9";
const BRAND_BLUE_DARK = "#0369a1";

/** TapMenu mark: mavi nokta + üç yuvarlak menü çizgisi (transparan zemin). */
function tapMenuMarkSvg(pixelSize) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 100 100">
  <circle cx="28" cy="50" r="11" fill="${BRAND_BLUE}"/>
  <rect x="48" y="31" width="42" height="10" rx="5" fill="${BRAND_BLUE}"/>
  <rect x="48" y="45" width="42" height="10" rx="5" fill="${BRAND_BLUE}"/>
  <rect x="48" y="59" width="42" height="10" rx="5" fill="${BRAND_BLUE}"/>
</svg>`;
}

/** Kare ikon zemin gradient. */
function tapMenuIconGradientSvg(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="iconBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="40%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="${BRAND_BLUE_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#iconBg)"/>
</svg>`;
}

/** Beyaz mark — mavi gradient zemin üzerinde yüksek kontrast. */
function tapMenuMarkWhiteSvg(pixelSize) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 100 100">
  <circle cx="28" cy="50" r="11" fill="#ffffff"/>
  <rect x="48" y="31" width="42" height="10" rx="5" fill="#ffffff"/>
  <rect x="48" y="45" width="42" height="10" rx="5" fill="#ffffff"/>
  <rect x="48" y="59" width="42" height="10" rx="5" fill="#ffffff"/>
</svg>`;
}

async function ensureMarkSourcePng() {
  if (existsSync(markPath)) {
    return sharp(markPath).ensureAlpha().png().toBuffer();
  }

  const mark512 = await sharp(Buffer.from(tapMenuMarkSvg(512))).png().toBuffer();
  mkdirSync(path.dirname(markPath), { recursive: true });
  writeFileSync(markPath, mark512);
  console.log("  (created public/brand/tapmenu-mark.png from SVG)");
  return mark512;
}

async function loadWordmarkPng(maxWidth) {
  return sharp(logoPath)
    .ensureAlpha()
    .resize({ width: maxWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
}

/** Kare ikon: gradient zemin + ortada mark (beyaz, yüksek kontrast). */
async function makeSquareIcon(size) {
  const markRatio = 0.62;
  const markSize = Math.max(1, Math.round(size * markRatio));

  const background = await sharp(Buffer.from(tapMenuIconGradientSvg(size, size)))
    .png()
    .toBuffer();

  const markPng = await sharp(Buffer.from(tapMenuMarkWhiteSvg(markSize)))
    .png()
    .toBuffer();

  const { width: mw = 0, height: mh = 0 } = await sharp(markPng).metadata();
  const left = Math.max(0, Math.round((size - mw) / 2));
  const top = Math.max(0, Math.round((size - mh) / 2));

  return sharp(background)
    .composite([{ input: markPng, left, top }])
    .png()
    .toBuffer();
}

async function makeOpenGraphImage() {
  const width = 1200;
  const height = 630;

  const logoWidth = 720;
  const logoPng = await loadWordmarkPng(logoWidth);
  const logoMeta = await sharp(logoPng).metadata();
  const logoH = logoMeta.height ?? 205;
  const logoX = Math.round((width - logoWidth) / 2);
  const logoY = Math.round(height * 0.22 - logoH / 2);
  const logoB64 = logoPng.toString("base64");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="pageBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="55%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#e0f2fe"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#pageBg)"/>
  <image href="data:image/png;base64,${logoB64}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${width / 2}" y="${Math.round(height * 0.72)}" text-anchor="middle" fill="#475569" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="32" font-weight="500">QR Menü Yönetim Sistemi</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  mkdirSync(path.join(root, "public/brand"), { recursive: true });

  console.log("Sources:");
  console.log("  wordmark:", logoPath);
  console.log("  mark:", existsSync(markPath) ? markPath : "(will create from SVG)");

  await ensureMarkSourcePng();

  const icon512 = await makeSquareIcon(512);
  const icon180 = await makeSquareIcon(180);
  const png16 = await makeSquareIcon(16);
  const png32 = await makeSquareIcon(32);
  const png48 = await makeSquareIcon(48);
  const og = await makeOpenGraphImage();

  writeFileSync(path.join(appDir, "icon.png"), icon512);
  writeFileSync(path.join(appDir, "apple-icon.png"), icon180);
  writeFileSync(path.join(appDir, "opengraph-image.png"), og);

  const ico = await toIco([png16, png32, png48]);
  writeFileSync(path.join(appDir, "favicon.ico"), ico);

  console.log("Generated:");
  console.log("  app/favicon.ico (mark, 16/32/48)");
  console.log("  app/icon.png (512x512, mark on gradient)");
  console.log("  app/apple-icon.png (180x180, mark on gradient)");
  console.log("  app/opengraph-image.png (wordmark, 1200x630)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
