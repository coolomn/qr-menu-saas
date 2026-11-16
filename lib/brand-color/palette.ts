/**
 * Faz 2.11d: logodan baskın renk çıkarma (saf fonksiyon; piksel dizisi alır, DOM'a dokunmaz).
 * Basit nicemleme: renk kanalları 16 seviyeye indirilir, benzerler birleştirilir, beyaz/siyah/şeffaf ve
 * (renkli seçenek varken) gri tonlar elenir. Puan = pay × (0.4 + canlılık).
 */
import { rgbToHsl, toHex, type Rgb } from "./color-utils";

export type PaletteColor = { hex: string; /** Logodaki (elenmeyen) piksel payı, 0–1. */ share: number; saturation: number };

type Bucket = { r: number; g: number; b: number; count: number };

const STEP = 16;
const MERGE_DISTANCE = 48;

/** İki rengin RGB uzaklığı (0–441). Önerileri tekilleştirmek için de kullanılır. */
export function colorDistance(a: Rgb, b: Rgb): number {
  return distance(a, b);
}

function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function extractPalette(pixels: ArrayLike<number>, maxColors = 4): PaletteColor[] {
  const buckets = new Map<number, Bucket>();
  let counted = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 128) continue; // şeffaf
    if (r > 240 && g > 240 && b > 240) continue; // beyaz zemin
    if (r < 20 && g < 20 && b < 20) continue; // siyah kenar/gölge
    const key = ((r / STEP) | 0) * 256 + ((g / STEP) | 0) * 16 + ((b / STEP) | 0);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
    counted++;
  }
  if (counted === 0) return [];

  // Kova ortalamaları; en kalabalıktan başlayıp yakın renkleri birleştir.
  const means = [...buckets.values()]
    .map((b) => ({ rgb: { r: b.r / b.count, g: b.g / b.count, b: b.b / b.count }, count: b.count }))
    .sort((a, b) => b.count - a.count);
  const clusters: { rgb: Rgb; count: number }[] = [];
  for (const m of means) {
    const near = clusters.find((c) => distance(c.rgb, m.rgb) < MERGE_DISTANCE);
    if (near) {
      const total = near.count + m.count;
      near.rgb = {
        r: (near.rgb.r * near.count + m.rgb.r * m.count) / total,
        g: (near.rgb.g * near.count + m.rgb.g * m.count) / total,
        b: (near.rgb.b * near.count + m.rgb.b * m.count) / total,
      };
      near.count = total;
    } else {
      clusters.push({ rgb: { ...m.rgb }, count: m.count });
    }
  }

  const scored = clusters
    .map((c) => {
      const hsl = rgbToHsl(c.rgb);
      return { hex: toHex(c.rgb), share: c.count / counted, saturation: hsl.s, score: (c.count / counted) * (0.4 + hsl.s) };
    })
    .filter((c) => c.share >= 0.02)
    .sort((a, b) => b.score - a.score);

  // Renkli seçenek varsa gri tonları ele (gri logo ise hepsi kalır).
  const colorful = scored.filter((c) => c.saturation >= 0.2);
  const pool = colorful.length > 0 ? colorful : scored;
  return pool.slice(0, maxColors).map(({ hex, share, saturation }) => ({ hex, share, saturation }));
}

