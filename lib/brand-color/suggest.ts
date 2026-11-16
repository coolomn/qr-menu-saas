/** Faz 2.11d: logo paletinden, beyaz zeminde okunaklı ve birbirinden ayırt edilebilir marka rengi önerileri. */
import { ensureReadableOnWhite, parseHex } from "./color-utils";
import { colorDistance, extractPalette, type PaletteColor } from "./palette";

export type BrandColorSuggestion = {
  /** Logodaki özgün renk. */
  original: string;
  /** Önerilen (gerekirse koyulaştırılmış) renk. */
  hex: string;
  adjusted: boolean;
  /** Beyaza karşı kontrast oranı. */
  ratio: number;
};

/** Koyulaştırma sonrası bu uzaklığın altındaki renkler gözle ayırt edilemez → teke indirilir. */
export const MIN_SUGGESTION_DISTANCE = 40;

export function suggestBrandColors(palette: readonly PaletteColor[]): BrandColorSuggestion[] {
  const all: BrandColorSuggestion[] = [];
  for (const color of palette) {
    const readable = ensureReadableOnWhite(color.hex);
    if (readable) all.push({ original: color.hex, hex: readable.hex, adjusted: readable.adjusted, ratio: readable.ratio });
  }
  return all.filter((s, i) => {
    const rgb = parseHex(s.hex)!;
    return all.findIndex((o) => colorDistance(parseHex(o.hex)!, rgb) < MIN_SUGGESTION_DISTANCE) === i;
  });
}

export function suggestFromPixels(pixels: ArrayLike<number>, maxColors = 4): BrandColorSuggestion[] {
  return suggestBrandColors(extractPalette(pixels, maxColors));
}
