import { DEFAULT_THEME_ID, type ThemeId } from "./ids";
import { DEFAULT_FONT_STYLE_ID, type FontStyleId } from "./font-ids";
import { normalizeThemeId } from "./normalize";
import { normalizeFontStyleId, defaultFontStyleForAppearance } from "./font-normalize";
import { APPEARANCE_REGISTRY, type MenuSurfaceClasses, type MenuThemeClasses } from "./registry";
import { FONT_REGISTRY, type MenuFontClasses } from "./font-registry";
import {
  resolveBrandColor,
  resolvePriceColor,
  resolveTabActiveColor,
} from "./accents";
import { resolvePriceTypography, type PriceTypography } from "./price-typography";

export type ResolvedMenuPresentation = {
  appearance: ThemeId;
  font: FontStyleId;
  brand: string;
  priceColor: string;
  priceTypography: PriceTypography;
  tabActiveColor: string;
  surfaces: MenuSurfaceClasses;
  fonts: MenuFontClasses;
  /** Yüzey + font birleşimi (bileşenler için). */
  classes: MenuThemeClasses;
  /** @deprecated appearance kullanın */
  id: ThemeId;
  /** @deprecated brand kullanın */
  accent: string;
};

function mergeClasses(
  surfaces: MenuSurfaceClasses,
  fonts: MenuFontClasses
): MenuThemeClasses {
  return {
    ...surfaces,
    ...fonts,
    fontBody: fonts.body,
    fontHeading: fonts.heading,
  };
}

export function resolveMenuPresentation(
  appearanceRaw: unknown,
  fontRaw: unknown,
  primaryColorRaw?: string | null
): ResolvedMenuPresentation {
  const appearance = normalizeThemeId(appearanceRaw);
  const font = normalizeFontStyleId(fontRaw);
  const brand = resolveBrandColor(primaryColorRaw);
  const surfaces = APPEARANCE_REGISTRY[appearance] ?? APPEARANCE_REGISTRY[DEFAULT_THEME_ID];
  const fonts = FONT_REGISTRY[font] ?? FONT_REGISTRY[DEFAULT_FONT_STYLE_ID];
  const priceColor = resolvePriceColor(appearance, brand);
  const priceTypography = resolvePriceTypography(font);
  const tabActiveColor = resolveTabActiveColor(appearance, brand);

  return {
    appearance,
    font,
    brand,
    priceColor,
    priceTypography,
    tabActiveColor,
    surfaces,
    fonts,
    classes: mergeClasses(surfaces, fonts),
    id: appearance,
    accent: brand,
  };
}

/** Görünüm + varsayılan font (önizleme / geriye dönük). */
export function resolveMenuTheme(
  appearanceRaw: unknown,
  primaryColorRaw?: string | null
): ResolvedMenuPresentation {
  const appearance = normalizeThemeId(appearanceRaw);
  const font = defaultFontStyleForAppearance(appearance);
  return resolveMenuPresentation(appearance, font, primaryColorRaw);
}

export type ResolvedMenuTheme = ResolvedMenuPresentation;
