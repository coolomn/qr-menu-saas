import type { FontStyleId } from "./font-ids";

export type MenuFontClasses = {
  body: string;
  heading: string;
};

const CLASSIC_FONTS: MenuFontClasses = {
  body: "font-sans",
  heading: "font-sans",
};

const MODERN_FONTS: MenuFontClasses = {
  body: "font-[family-name:var(--font-menu-dm-sans)]",
  heading: "font-[family-name:var(--font-menu-dm-sans)]",
};

const PREMIUM_FONTS: MenuFontClasses = {
  body: "font-[family-name:var(--font-menu-inter)]",
  heading: "font-[family-name:var(--font-menu-playfair)]",
};

const GEOMETRIC_FONTS: MenuFontClasses = {
  body: "font-[family-name:var(--font-menu-inter)]",
  heading: "font-[family-name:var(--font-menu-space-grotesk)]",
};

export const FONT_REGISTRY: Record<FontStyleId, MenuFontClasses> = {
  classic: CLASSIC_FONTS,
  modern: MODERN_FONTS,
  premium: PREMIUM_FONTS,
  geometric: GEOMETRIC_FONTS,
};
