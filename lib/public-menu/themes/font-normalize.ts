import { DEFAULT_FONT_STYLE_ID, FONT_STYLE_IDS, type FontStyleId } from "./font-ids";
import type { ThemeId } from "./ids";

export function normalizeFontStyleId(raw: unknown): FontStyleId {
  if (typeof raw === "string" && (FONT_STYLE_IDS as readonly string[]).includes(raw)) {
    return raw as FontStyleId;
  }
  return DEFAULT_FONT_STYLE_ID;
}

export const FONT_STYLE_LABELS: Record<FontStyleId, string> = {
  classic: "Klasik",
  modern: "Modern",
  premium: "Premium",
  geometric: "Geometrik",
};

export const FONT_STYLE_DESCRIPTIONS: Record<FontStyleId, string> = {
  classic: "Sistem sans-serif",
  modern: "DM Sans",
  premium: "Inter + Playfair Display",
  geometric: "Inter + Space Grotesk",
};

/** Faz 1a uyumu: görünüm seçildiğinde varsayılan font eşlemesi. */
export function defaultFontStyleForAppearance(appearance: ThemeId): FontStyleId {
  switch (appearance) {
    case "modern":
      return "modern";
    case "premium":
      return "premium";
    case "dark":
      return "geometric";
    default:
      return "classic";
  }
}
