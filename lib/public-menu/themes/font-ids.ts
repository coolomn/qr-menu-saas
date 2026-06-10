export const FONT_STYLE_IDS = ["classic", "modern", "premium", "geometric"] as const;

export type FontStyleId = (typeof FONT_STYLE_IDS)[number];

export const DEFAULT_FONT_STYLE_ID: FontStyleId = "classic";
