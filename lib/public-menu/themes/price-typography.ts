import type { FontStyleId } from "./font-ids";
import { FONT_REGISTRY } from "./font-registry";

export type PriceTypography = {
  /** Tekil ürün fiyatı */
  product: string;
  /** Varyant satır fiyatı */
  variant: string;
};

/**
 * Fiyat tipografisi — seçili font_style ile uyumlu, ürün adından daha hafif.
 * Aile: premium/geometric’te başlıkla aynı (heading), diğerlerinde body.
 */
export function resolvePriceTypography(font: FontStyleId): PriceTypography {
  const fonts = FONT_REGISTRY[font];
  const family =
    font === "premium" || font === "geometric" ? fonts.heading : fonts.body;

  const weight =
    font === "premium"
      ? "font-normal"
      : font === "classic"
        ? "font-semibold"
        : "font-medium";

  const base = `${family} ${weight} tracking-tight tabular-nums whitespace-nowrap shrink-0`;

  return {
    product: `${base} text-sm md:text-base`,
    variant: `${base} text-xs md:text-sm`,
  };
}
