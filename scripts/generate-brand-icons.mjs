/**
 * TapMenu marka ikonlarını public/brand/tapmenu-logo.png kaynağından üretir.
 * Kullanım: node scripts/generate-brand-icons.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const logoPath = path.join(root, "public/brand/tapmenu-logo.png");
const appDir = path.join(root, "app");

const BG = { r: 0, g: 0, b: 0, alpha: 1 };

async function makeSquarePng(size, logoWidthRatio = 0.82) {
  const maxLogoWidth = Math.max(1, Math.round(size * logoWidthRatio));
  const resized = await sharp(logoPath)
    .resize({ width: maxLogoWidth, withoutEnlargement: false })
    .png()
    .toBuffer();
  const { width: lw = 0, height: lh = 0 } = await sharp(resized).metadata();
  const left = Math.max(0, Math.round((size - lw) / 2));
  const top = Math.max(0, Math.round((size - lh) / 2));

  return sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function makeOpenGraphImage() {
  const width = 1200;
  const height = 630;
  const logoWidth = 520;
  const logoPng = await sharp(logoPath).resize({ width: logoWidth }).png().toBuffer();
  const logoB64 = logoPng.toString("base64");
  const logoMeta = await sharp(logoPng).metadata();
  const logoH = logoMeta.height ?? 148;
  const logoX = Math.round((width - logoWidth) / 2);
  const logoY = Math.round(height * 0.22 - logoH / 2);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050505"/>
      <stop offset="55%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#101820"/>
    </linearGradient>
    <radialGradient id="glow" cx="75%" cy="18%" r="45%">
      <stop offset="0%" stop-color="#0088cc" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#0088cc" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <image href="data:image/png;base64,${logoB64}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoH}" preserveAspectRatio="xMidYMid meet"/>
  <text x="${width / 2}" y="${Math.round(height * 0.62)}" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="52" font-weight="700" letter-spacing="-0.5">TapMenu</text>
  <text x="${width / 2}" y="${Math.round(height * 0.72)}" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="500">QR Menü Yönetim Sistemi</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  mkdirSync(path.join(root, "public/brand"), { recursive: true });

  const icon512 = await makeSquarePng(512);
  const icon180 = await makeSquarePng(180);
  const png16 = await makeSquarePng(16, 0.9);
  const png32 = await makeSquarePng(32, 0.88);
  const png48 = await makeSquarePng(48, 0.86);
  const og = await makeOpenGraphImage();

  writeFileSync(path.join(appDir, "icon.png"), icon512);
  writeFileSync(path.join(appDir, "apple-icon.png"), icon180);
  writeFileSync(path.join(appDir, "opengraph-image.png"), og);

  const ico = await toIco([png16, png32, png48]);
  writeFileSync(path.join(appDir, "favicon.ico"), ico);

  console.log("Generated:");
  console.log("  app/favicon.ico (16/32/48)");
  console.log("  app/icon.png (512x512)");
  console.log("  app/apple-icon.png (180x180)");
  console.log("  app/opengraph-image.png (1200x630)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
