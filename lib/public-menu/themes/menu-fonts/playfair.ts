import { Playfair_Display } from "next/font/google";

export const menuFontPlayfair = Playfair_Display({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-menu-playfair",
  display: "swap",
});
