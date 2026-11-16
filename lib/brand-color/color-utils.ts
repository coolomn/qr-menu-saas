/** Faz 2.11d: renk yardımcıları (saf fonksiyonlar). WCAG kontrast + HSL. */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG göreli parlaklık (0–1). */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG kontrast oranı (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type Hsl = { h: number; s: number; l: number };

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Koyu görünümün sayfa zemini (zinc-950, lib/public-menu/themes/registry.ts). Marka rengi bu zeminde başlık metni olur. */
export const DARK_THEME_BG: Rgb = { r: 9, g: 9, b: 11 };

/** Metin/fiyat olarak beyaz zeminde okunur olması için asgari kontrast (WCAG AA, normal metin). */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Rengi, tonunu koruyarak beyaz zemine karşı en az `min` kontrasta çıkarana kadar koyulaştırır.
 * Zaten yeterliyse aynen döner. `adjusted` = değiştirildi mi.
 */
export function ensureReadableOnWhite(hex: string, min = MIN_TEXT_CONTRAST): { hex: string; adjusted: boolean; ratio: number } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const ratio = contrastRatio(rgb, WHITE);
  if (ratio >= min) return { hex: toHex(rgb), adjusted: false, ratio };
  const hsl = rgbToHsl(rgb);
  for (let l = hsl.l; l >= 0; l -= 0.01) {
    const candidate = hslToRgb({ ...hsl, l: Math.max(0, l) });
    const r = contrastRatio(candidate, WHITE);
    if (r >= min) return { hex: toHex(candidate), adjusted: true, ratio: r };
  }
  const black = { r: 0, g: 0, b: 0 };
  return { hex: toHex(black), adjusted: true, ratio: contrastRatio(black, WHITE) };
}
