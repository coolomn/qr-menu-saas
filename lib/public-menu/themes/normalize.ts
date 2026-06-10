import { DEFAULT_THEME_ID, THEME_IDS, type ThemeId } from "./ids";

export function normalizeThemeId(raw: unknown): ThemeId {
  if (typeof raw === "string" && (THEME_IDS as readonly string[]).includes(raw)) {
    return raw as ThemeId;
  }
  return DEFAULT_THEME_ID;
}

export const THEME_ID_LABELS: Record<ThemeId, string> = {
  classic: "Klasik",
  modern: "Modern",
  premium: "Premium",
  beach: "Sahil",
  dark: "Koyu",
};

export const THEME_ID_DESCRIPTIONS: Record<ThemeId, string> = {
  classic: "Mevcut sade menü görünümü",
  modern: "Yuvarlatılmış kartlar, slate tonları",
  premium: "Zarif boşluklar, stone paleti",
  beach: "Sıcak amber tonları",
  dark: "Koyu arka plan, yüksek kontrast",
};
