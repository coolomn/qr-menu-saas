import { menuFontDMSans } from "@/lib/public-menu/themes/menu-fonts/dm-sans";
import { menuFontInter } from "@/lib/public-menu/themes/menu-fonts/inter";
import { menuFontPlayfair } from "@/lib/public-menu/themes/menu-fonts/playfair";
import { menuFontSpaceGrotesk } from "@/lib/public-menu/themes/menu-fonts/space-grotesk";
import { allMenuFontVariableClasses } from "@/lib/public-menu/themes/font-loading-policy";

/** Admin font picker preview only — loads all menu fonts on admin pages. */
export const MENU_FONT_VARIABLE_CLASSES = allMenuFontVariableClasses({
  inter: menuFontInter.variable,
  dmSans: menuFontDMSans.variable,
  playfair: menuFontPlayfair.variable,
  spaceGrotesk: menuFontSpaceGrotesk.variable,
});
