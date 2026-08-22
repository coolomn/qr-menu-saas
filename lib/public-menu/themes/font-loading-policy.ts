import type { FontStyleId } from "./font-ids";
import { DEFAULT_FONT_STYLE_ID } from "./font-ids";
import { normalizeFontStyleId } from "./font-normalize";

export type MenuFontKey = "inter" | "dmSans" | "playfair" | "spaceGrotesk";

/** Public menu: which font families each font_style_id needs at runtime. */
export const FONT_STYLE_REQUIRED_MENU_FONTS: Record<FontStyleId, readonly MenuFontKey[]> = {
  /** Uses Tailwind font-sans → root Geist variable; no extra menu fonts. */
  classic: [],
  modern: ["dmSans"],
  premium: ["inter", "playfair"],
  geometric: ["inter", "spaceGrotesk"],
};

export function resolveRequiredMenuFontKeys(fontStyleId: unknown): readonly MenuFontKey[] {
  const normalized = normalizeFontStyleId(fontStyleId);
  return FONT_STYLE_REQUIRED_MENU_FONTS[normalized] ?? FONT_STYLE_REQUIRED_MENU_FONTS[DEFAULT_FONT_STYLE_ID];
}

export function joinMenuFontVariableClasses(
  fontStyleId: unknown,
  variableByKey: Record<MenuFontKey, string>
): string {
  return resolveRequiredMenuFontKeys(fontStyleId)
    .map((key) => variableByKey[key])
    .join(" ");
}

/** Admin font picker önizlemesi — tüm menü fontları gerekir. */
export function allMenuFontVariableClasses(variableByKey: Record<MenuFontKey, string>): string {
  return (Object.keys(variableByKey) as MenuFontKey[]).map((key) => variableByKey[key]).join(" ");
}

/**
 * Public menu loads fonts via runtime stylesheet injection (see menu-font-css.ts).
 * joinMenuFontVariableClasses is for admin preview / tests only.
 */
