import type { ThemeId } from "./ids";

const DEFAULT_BRAND = "#2563eb";

/** Görünüme göre semantic fiyat renkleri (primary_color’dan bağımsız). */
const SEMANTIC_PRICE: Partial<Record<ThemeId, string>> = {
  premium: "#57534e",
  beach: "#9a6b3a",
  dark: "#d6b45c",
};

export function resolveBrandColor(raw: string | null | undefined): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed || DEFAULT_BRAND;
}

export function resolvePriceColor(appearance: ThemeId, brandColor: string): string {
  if (appearance === "classic" || appearance === "modern") {
    return brandColor;
  }
  return SEMANTIC_PRICE[appearance] ?? brandColor;
}

export function resolveTabActiveColor(appearance: ThemeId, brandColor: string): string {
  return brandColor;
}
