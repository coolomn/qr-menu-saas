/**
 * TapMenu marka ikonlarını public/brand/tapmenu-logo.png kaynağından üretir.
 * Kaynak logo alpha kanalı korunur; siyah zemin eklenmez.
 * Kullanım: node scripts/generate-brand-icons.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const logoPath = path.join(root, "public/brand/tapmenu-logo.png");
const appDir = path.join(root, "app");

function tapMenuIconGradientSvg(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="iconBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4fc3f7"/>
      <stop offset="45%" stop-color="#0ea5e9"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#iconBg)"/>
</svg>`;
}

async function loadLogoPng(maxLogoWidth) {
  return sharp(logoPath)
    .ensureAlpha()
    .resize({ width: maxLogoWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
}

/** Mavi gradient zemin + ortada transparan logo (alpha korunur). */
async function makeSquareIcon(size, logoWidthRatio = 0.72) {
  const maxLogoWidth = Math.max(1, Math.round(size * logoWidthRatio));
  const logoPng = await loadLogoPng(maxLogoWidth);
  const { width: lw = 0, height: lh = 0 } = await sharp(logoPng).metadata();
  const left = Math.max(0, Math.round((size - lw) / 2));
  const top = Math.max(0, Math.round((size - lh) / 2));

  const background = await sharp(Buffer.from(tapMenuIconGradientSvg(size, size)))
    .png()
    .toBuffer();

  return sharp(background)
    .composite([{ input: logoPng, left, top }])
    .png()
    .toBuffer();
}

async function makeOpenGraphImage() {
  const width = 1200;
  const height = 630;
  const cardWidth = 640;
  const cardHeight = 200;
  const cardX = Math.round((width - cardWidth) / 2);
  const cardY = Math.round(height * 0.18);

  const logoWidth = 480;
  const logoPng = await loadLogoPng(logoWidth);
  const logoMeta = await sharp(logoPng).metadata();
  const logoH = logoMeta.height ?? 136;
  const logoX = Math.round((width - logoWidth) / 2);
  const logoY = cardY + Math.round((cardHeight - logoH) / 2);

  const logoB64 = logoPng.toString("base64");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="pageBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="55%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#e0f2fe"/>
    </linearGradient>
    <filter id="cardShadow" x="-8%" y="-8%" width="116%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#0ea5e9" flood-opacity="0.12"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.06"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#pageBg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="28" fill="#ffffff" filter="url(#cardShadow)"/>
  <image href="data:image/png;base64,${logoB64}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${width / 2}" y="${Math.round(height * 0.58)}" text-anchor="middle" fill="#0f172a" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="56" font-weight="700" letter-spacing="-0.5">TapMenu</text>
  <text x="${width / 2}" y="${Math.round(height * 0.68)}" text-anchor="middle" fill="#475569" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="500">QR Menü Yönetim Sistemi</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  mkdirSync(path.join(root, "public/brand"), { recursive: true });

  const icon512 = await makeSquareIcon(512);
  const icon180 = await makeSquareIcon(180);
  const png16 = await makeSquareIcon(16, 0.78);
  const png32 = await makeSquareIcon(32, 0.76);
  const png48 = await makeSquareIcon(48, 0.74);
  const og = await makeOpenGraphImage();

  writeFileSync(path.join(appDir, "icon.png"), icon512);
  writeFileSync(path.join(appDir, "apple-icon.png"), icon180);
  writeFileSync(path.join(appDir, "opengraph-image.png"), og);

  const ico = await toIco([png16, png32, png48]);
  writeFileSync(path.join(appDir, "favicon.ico"), ico);

  console.log("Generated:");
  console.log("  app/favicon.ico (16/32/48, mavi gradient zemin)");
  console.log("  app/icon.png (512x512, mavi gradient zemin)");
  console.log("  app/apple-icon.png (180x180, mavi gradient zemin)");
  console.log("  app/opengraph-image.png (1200x630, açık zemin + beyaz kart)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
