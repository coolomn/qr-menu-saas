export const THEME_IDS = ["classic", "modern", "premium", "beach", "dark"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = "classic";
