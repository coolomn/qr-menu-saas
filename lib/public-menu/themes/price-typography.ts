import type { FontStyleId } from "./font-ids";
import { FONT_REGISTRY } from "./font-registry";

export type PriceTypography = {
  /** Tekil ürün fiyatı */
  product: string;
  /** Varyant satır fiyatı */
  variant: string;
};

const PRICE_INSET = "pr-3 md:pr-4";

/**
 * Fiyat tipografisi — seçili font_style ile uyumlu, ürün adından daha hafif.
 * Premium/geometric: başlıkla aynı aile (Playfair / Space Grotesk).
 */
export function resolvePriceTypography(font: FontStyleId): PriceTypography {
  const fonts = FONT_REGISTRY[font];
  const family =
    font === "premium" || font === "geometric" ? fonts.heading : fonts.body;

  const base = `${family} tracking-tight tabular-nums whitespace-nowrap shrink-0 ${PRICE_INSET}`;

  if (font === "premium") {
    return {
      product: `${base} font-medium text-base md:text-lg`,
      variant: `${base} font-medium text-sm md:text-base`,
    };
  }

  const weight =
    font === "classic" ? "font-semibold" : "font-medium";

  return {
    product: `${base} ${weight} text-sm md:text-base`,
    variant: `${base} ${weight} text-xs md:text-sm`,
  };
}
