/**
 * Faz 2.6: QR kodu tarayıcıda/sunucuda kendimiz üretiriz (dış servis yok → adres üçüncü tarafa gitmez,
 * servis kapansa da basılı/üretilen kodlar etkilenmez). Çıktı tek <path>'li küçük bir SVG'dir.
 */
import qrcode from "qrcode-generator";

export type QrDotShape = "square" | "rounded" | "dots";
export const QR_DOT_SHAPES: readonly QrDotShape[] = ["square", "rounded", "dots"];

export type QrSvgOptions = {
  text: string;
  /** #rrggbb */
  foreground: string;
  /** #rrggbb veya "transparent" */
  background: string;
  shape?: QrDotShape;
  /** Ortaya konacak logo: yalnızca base64 data URL (png/jpeg/webp). */
  logoHref?: string | null;
  /** Logonun arkasındaki levha rengi; verilmezse arka plan (şeffafsa beyaz). Şeffaf kodu renkli bir panele koyarken kullanılır. */
  logoPlate?: string;
  /** Kod genişliğinin oranı (0.12–0.26). */
  logoScale?: number;
  /** Modül cinsinden sessiz bölge (okuyucu için boşluk). */
  quietZone?: number;
};

export type QrSvgResult = {
  svg: string;
  /** Kök <svg> etiketi olmadan içerik (kart gibi başka bir SVG'nin içine gömmek için). */
  body: string;
  /** body ile birlikte kullanılacak shape-rendering değeri. */
  shapeRendering: "crispEdges" | "geometricPrecision";
  /** Kodun kenar uzunluğu (sessiz bölge dahil), SVG viewBox birimiyle. */
  size: number;
  moduleCount: number;
  hasLogo: boolean;
};

const HEX = /^#[0-9a-f]{6}$/i;
const LOGO_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const DEFAULT_QR_FOREGROUND = "#111827";
export const DEFAULT_QR_BACKGROUND = "#ffffff";

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  if (HEX.test(v)) return v.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return fallback;
}

export function isSafeLogoHref(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length < 700_000 && LOGO_DATA_URL.test(value);
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = normalizeHexColor(hex, "#000000");
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG kontrast oranı (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type QrColorWarning = "low-contrast" | "inverted" | null;

/** Telefon kameraları koyu-üstü-açık kodu güvenle okur; düşük kontrast ve ters renk risklidir. */
export function qrColorWarning(foreground: string, background: string): QrColorWarning {
  if (background === "transparent") return null;
  if (luminance(foreground) > luminance(background)) return "inverted";
  if (contrastRatio(foreground, background) < 4) return "low-contrast";
  return null;
}

function f(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function modulePath(shape: QrDotShape, x: number, y: number): string {
  if (shape === "dots") {
    const r = 0.48;
    return `M${f(x + 0.5 - r)} ${f(y + 0.5)}a${r} ${r} 0 1 0 ${f(r * 2)} 0a${r} ${r} 0 1 0 ${f(-r * 2)} 0z`;
  }
  if (shape === "rounded") {
    const r = 0.3;
    const s = 1 - r * 2;
    return `M${f(x + r)} ${f(y)}h${f(s)}a${r} ${r} 0 0 1 ${r} ${r}v${f(s)}a${r} ${r} 0 0 1 ${f(-r)} ${r}h${f(-s)}a${r} ${r} 0 0 1 ${f(-r)} ${f(-r)}v${f(-s)}a${r} ${r} 0 0 1 ${r} ${f(-r)}z`;
  }
  return `M${f(x)} ${f(y)}h1v1h-1z`;
}

/** Konum işaretleri (3 köşedeki büyük kareler) her zaman düz kare kalır: okunabilirlik için. */
function inFinder(row: number, col: number, count: number): boolean {
  const near = (v: number) => v < 7;
  const far = (v: number) => v >= count - 7;
  return (near(row) && near(col)) || (near(row) && far(col)) || (far(row) && near(col));
}

export function buildQrSvg(options: QrSvgOptions): QrSvgResult {
  const foreground = normalizeHexColor(options.foreground, DEFAULT_QR_FOREGROUND);
  const background =
    options.background === "transparent" ? "transparent" : normalizeHexColor(options.background, DEFAULT_QR_BACKGROUND);
  const shape: QrDotShape = QR_DOT_SHAPES.includes(options.shape as QrDotShape) ? (options.shape as QrDotShape) : "square";
  const logoHref = isSafeLogoHref(options.logoHref) ? options.logoHref : null;
  const quiet = Math.min(8, Math.max(0, Math.round(options.quietZone ?? 4)));

  // Logo varsa hata düzeltmesi en yüksek seviyede (orta kısım örtülür).
  const qr = qrcode(0, logoHref ? "H" : "Q");
  qr.addData(options.text);
  qr.make();
  const count = qr.getModuleCount();
  const size = count + quiet * 2;

  // Logo alanı: ortada, çift/tek uyumlu kare; kod alanının en çok ~%7'si (H seviyesi %30'a kadar toparlar).
  let hole: { from: number; to: number } | null = null;
  let logoBox = 0;
  if (logoHref) {
    const scale = Math.min(0.26, Math.max(0.12, options.logoScale ?? 0.2));
    logoBox = Math.max(5, Math.round(count * scale));
    if ((count - logoBox) % 2 !== 0) logoBox += 1;
    const pad = 1; // logonun çevresinde 1 modül boşluk
    const from = (count - logoBox) / 2 - pad;
    hole = { from, to: from + logoBox + pad * 2 - 1 };
  }

  let d = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      if (hole && row >= hole.from && row <= hole.to && col >= hole.from && col <= hole.to) continue;
      const kind: QrDotShape = inFinder(row, col, count) ? "square" : shape;
      d += modulePath(kind, col + quiet, row + quiet);
    }
  }

  let logo = "";
  if (logoHref && hole) {
    const x = hole.from + quiet;
    const span = hole.to - hole.from + 1;
    const plate = options.logoPlate
      ? normalizeHexColor(options.logoPlate, "#ffffff")
      : background === "transparent"
        ? "#ffffff"
        : background;
    logo =
      `<rect x="${x}" y="${x}" width="${span}" height="${span}" rx="${f(span * 0.14)}" fill="${plate}"/>` +
      `<image xlink:href="${logoHref}" x="${x + 1}" y="${x + 1}" width="${span - 2}" height="${span - 2}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const bg = background === "transparent" ? "" : `<rect width="${size}" height="${size}" fill="${background}"/>`;
  const rendering: QrSvgResult["shapeRendering"] = shape === "square" ? "crispEdges" : "geometricPrecision";
  const body = `${bg}<path d="${d}" fill="${foreground}"/>${logo}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" shape-rendering="${rendering}">${body}</svg>`;

  return { svg, body, shapeRendering: rendering, size, moduleCount: count, hasLogo: Boolean(logoHref) };
}

/** Kök <svg> etiketindeki width/height'i verilen değerlerle değiştirir (çift öznitelik SVG'yi geçersiz yapar). */
export function setSvgSize(svg: string, width: number | string, height: number | string): string {
  return svg.replace(/^<svg\b([^>]*)>/, (_m, attrs: string) => {
    const rest = attrs.replace(/\s(?:width|height)="[^"]*"/g, "");
    return `<svg${rest} width="${width}" height="${height}">`;
  });
}
