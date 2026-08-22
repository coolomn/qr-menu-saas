import type { FontStyleId } from "./font-ids";
import { normalizeFontStyleId } from "./font-normalize";

export const MENU_FONT_STYLESHEET_BASE = "/fonts/menu";

export const MENU_FONT_STYLESHEET_BY_STYLE: Record<
  Exclude<FontStyleId, "classic">,
  string
> = {
  modern: `${MENU_FONT_STYLESHEET_BASE}/modern.css`,
  premium: `${MENU_FONT_STYLESHEET_BASE}/premium.css`,
  geometric: `${MENU_FONT_STYLESHEET_BASE}/geometric.css`,
};

export const MENU_FONT_SHELL_CLASS_BY_STYLE: Record<
  Exclude<FontStyleId, "classic">,
  string
> = {
  modern: "menu-font-shell-modern",
  premium: "menu-font-shell-premium",
  geometric: "menu-font-shell-geometric",
};

export function getMenuFontStylesheetHref(fontStyleId: unknown): string | null {
  const normalized = normalizeFontStyleId(fontStyleId);
  if (normalized === "classic") return null;
  return MENU_FONT_STYLESHEET_BY_STYLE[normalized];
}

export function getMenuFontShellClassName(fontStyleId: unknown): string {
  const normalized = normalizeFontStyleId(fontStyleId);
  if (normalized === "classic") return "";
  return MENU_FONT_SHELL_CLASS_BY_STYLE[normalized];
}

/** Expected woff2 count per style (excluding root Geist). */
export const MENU_FONT_WOFF2_COUNT_BY_STYLE: Record<FontStyleId, number> = {
  classic: 0,
  modern: 2,
  premium: 6,
  geometric: 5,
};
