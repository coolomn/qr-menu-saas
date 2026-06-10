import { DM_Sans, Inter, Playfair_Display, Space_Grotesk } from "next/font/google";

export const menuFontInter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-menu-inter",
  display: "swap",
});

export const menuFontDMSans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-menu-dm-sans",
  display: "swap",
});

export const menuFontPlayfair = Playfair_Display({
  subsets: ["latin", "latin-ext"],
  variable: "--font-menu-playfair",
  display: "swap",
});

export const menuFontSpaceGrotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-menu-space-grotesk",
  display: "swap",
});

/** Tüm menü font CSS değişkenlerini kök layout’a ekleyin. */
export const MENU_FONT_VARIABLE_CLASSES = [
  menuFontInter.variable,
  menuFontDMSans.variable,
  menuFontPlayfair.variable,
  menuFontSpaceGrotesk.variable,
].join(" ");
