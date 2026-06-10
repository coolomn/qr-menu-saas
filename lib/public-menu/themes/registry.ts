import type { ThemeId } from "./ids";
import type { MenuFontClasses } from "./font-registry";

/** Görünüm yüzeyleri — font aileleri font_style_id registry’sinden gelir. */
export type MenuSurfaceClasses = {
  pageRoot: string;
  pageEntering: string;
  pageEntered: string;
  header: string;
  headerInner: string;
  backButton: string;
  langSwitcher: string;
  langActive: string;
  langInactive: string;
  sliderSection: string;
  sliderInner: string;
  sliderFrame: string;
  categoryTabs: string;
  categoryTabBase: string;
  categoryTabActiveExtra: string;
  categoryTabInactive: string;
  main: string;
  emptyStateText: string;
  emptyStateLink: string;
  productCard: string;
  productImageWrap: string;
  productTitle: string;
  productPrice: string;
  productDescription: string;
  variantList: string;
  variantItem: string;
  variantLabel: string;
  variantPrice: string;
  allergenBadge: string;
  allergenLabel: string;
};

/** Geriye dönük: yüzey + font birleşimi. */
export type MenuThemeClasses = MenuSurfaceClasses & MenuFontClasses & {
  fontBody: string;
  fontHeading: string;
};

const CLASSIC_SURFACES: MenuSurfaceClasses = {
  pageRoot: "min-h-screen bg-gray-50 pb-24 selection:bg-gray-200",
  pageEntering: "transition-opacity duration-500 opacity-0",
  pageEntered: "transition-opacity duration-500 opacity-100",
  header: "bg-white shadow-sm sticky top-0 z-30",
  headerInner: "p-4 flex items-center gap-2 max-w-2xl mx-auto border-b border-gray-50",
  backButton:
    "flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-900 bg-gray-100 p-2 rounded-lg transition-colors",
  langSwitcher:
    "flex-shrink-0 bg-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black text-gray-900 shadow-lg flex gap-2 sm:gap-3 border border-gray-100 cursor-pointer select-none",
  langActive: "text-black",
  langInactive: "opacity-40 grayscale",
  sliderSection: "w-full bg-white pb-3 pt-3",
  sliderInner: "max-w-2xl mx-auto px-4",
  sliderFrame:
    "relative overflow-hidden rounded-2xl shadow-sm border border-gray-100 aspect-[16/9] bg-gray-900",
  categoryTabs: "flex overflow-x-auto gap-2 p-3 max-w-2xl mx-auto no-scrollbar scroll-smooth",
  categoryTabBase:
    "whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all",
  categoryTabActiveExtra: "shadow-md shadow-gray-200",
  categoryTabInactive: "bg-gray-100 text-gray-500 hover:bg-gray-200",
  main: "p-3 max-w-2xl mx-auto space-y-3 mt-1",
  emptyStateText: "text-sm font-bold text-gray-500",
  emptyStateLink:
    "text-sm font-black uppercase tracking-wide text-gray-800 underline underline-offset-4",
  productCard:
    "bg-white p-3 md:p-4 rounded-3xl shadow-sm border border-gray-100 flex gap-3 md:gap-4 hover:border-gray-200 transition-colors",
  productImageWrap:
    "w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-gray-100 rounded-2xl overflow-hidden shadow-inner relative self-start",
  productTitle: "font-black text-gray-900 leading-tight text-base md:text-lg min-w-0",
  productPrice: "",
  productDescription: "text-xs md:text-sm text-gray-500 font-medium leading-snug mb-2 line-clamp-2",
  variantList:
    "mb-2 rounded-xl border border-gray-100 bg-gray-50/80 divide-y divide-gray-100/90 overflow-hidden",
  variantItem: "flex items-center justify-between gap-3 px-2.5 py-1.5 md:px-3 md:py-2",
  variantLabel: "text-xs md:text-sm font-semibold text-gray-700 truncate min-w-0",
  variantPrice: "",
  allergenBadge:
    "flex items-center gap-1 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-lg",
  allergenLabel: "text-[8px] font-black text-gray-500 uppercase tracking-widest",
};

const MODERN_SURFACES: MenuSurfaceClasses = {
  ...CLASSIC_SURFACES,
  pageRoot: "min-h-screen bg-slate-50 pb-24 selection:bg-slate-200",
  header: "bg-white/95 backdrop-blur-md shadow-md sticky top-0 z-30 border-b border-slate-100",
  categoryTabBase:
    "whitespace-nowrap px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all",
  categoryTabActiveExtra: "shadow-lg",
  categoryTabInactive: "bg-slate-100 text-slate-500 hover:bg-slate-200",
  productCard:
    "bg-white p-3 md:p-4 rounded-2xl shadow-md border border-slate-100 flex gap-3 md:gap-4 hover:border-slate-200 transition-colors",
  productTitle: "font-bold text-slate-900 leading-tight text-base md:text-lg min-w-0",
};

const PREMIUM_SURFACES: MenuSurfaceClasses = {
  ...CLASSIC_SURFACES,
  pageRoot: "min-h-screen bg-stone-50 pb-24 selection:bg-stone-200",
  header: "bg-stone-50/95 shadow-sm sticky top-0 z-30 border-b border-stone-200/80",
  categoryTabBase:
    "whitespace-nowrap px-5 py-2.5 rounded-lg font-semibold text-xs uppercase tracking-[0.2em] transition-all",
  categoryTabInactive: "bg-stone-100 text-stone-500 hover:bg-stone-200",
  productCard:
    "bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-stone-200/90 flex gap-3 md:gap-4 hover:border-stone-300 transition-colors",
  productTitle: "font-semibold text-stone-900 leading-tight text-base md:text-lg min-w-0",
  productDescription: "text-xs md:text-sm text-stone-500 font-normal leading-snug mb-2 line-clamp-2",
};

const BEACH_SURFACES: MenuSurfaceClasses = {
  ...CLASSIC_SURFACES,
  pageRoot: "min-h-screen bg-amber-50/80 pb-24 selection:bg-amber-100",
  header: "bg-amber-50/95 shadow-sm sticky top-0 z-30 border-b border-amber-100",
  categoryTabInactive: "bg-amber-100/80 text-amber-800/60 hover:bg-amber-100",
  productCard:
    "bg-white/95 p-3 md:p-4 rounded-3xl shadow-sm border border-amber-100 flex gap-3 md:gap-4 hover:border-amber-200 transition-colors",
};

const DARK_SURFACES: MenuSurfaceClasses = {
  ...CLASSIC_SURFACES,
  pageRoot: "min-h-screen bg-zinc-950 pb-24 text-zinc-100 selection:bg-zinc-800",
  header: "bg-zinc-900/95 shadow-lg sticky top-0 z-30 border-b border-zinc-800",
  headerInner: "p-4 flex items-center gap-2 max-w-2xl mx-auto border-b border-zinc-800",
  backButton:
    "flex-shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-100 bg-zinc-800 p-2 rounded-lg transition-colors",
  langSwitcher:
    "flex-shrink-0 bg-zinc-800 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black text-zinc-100 shadow-lg flex gap-2 sm:gap-3 border border-zinc-700 cursor-pointer select-none",
  langActive: "text-white",
  langInactive: "opacity-40 grayscale",
  sliderSection: "w-full bg-zinc-900 pb-3 pt-3",
  sliderFrame:
    "relative overflow-hidden rounded-2xl shadow-sm border border-zinc-700 aspect-[16/9] bg-zinc-950",
  categoryTabInactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
  emptyStateText: "text-sm font-bold text-zinc-400",
  emptyStateLink:
    "text-sm font-black uppercase tracking-wide text-zinc-200 underline underline-offset-4",
  productCard:
    "bg-zinc-900 p-3 md:p-4 rounded-3xl shadow-sm border border-zinc-800 flex gap-3 md:gap-4 hover:border-zinc-700 transition-colors",
  productImageWrap:
    "w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-zinc-800 rounded-2xl overflow-hidden shadow-inner relative self-start",
  productTitle: "font-bold text-zinc-50 leading-tight text-base md:text-lg min-w-0",
  productDescription: "text-xs md:text-sm text-zinc-400 font-medium leading-snug mb-2 line-clamp-2",
  variantList:
    "mb-2 rounded-xl border border-zinc-700 bg-zinc-800/80 divide-y divide-zinc-700/90 overflow-hidden",
  variantLabel: "text-xs md:text-sm font-semibold text-zinc-300 truncate min-w-0",
  allergenBadge:
    "flex items-center gap-1 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded-lg",
  allergenLabel: "text-[8px] font-black text-zinc-400 uppercase tracking-widest",
};

export const APPEARANCE_REGISTRY: Record<ThemeId, MenuSurfaceClasses> = {
  classic: CLASSIC_SURFACES,
  modern: MODERN_SURFACES,
  premium: PREMIUM_SURFACES,
  beach: BEACH_SURFACES,
  dark: DARK_SURFACES,
};

/** @deprecated APPEARANCE_REGISTRY kullanın. */
export const THEME_REGISTRY = APPEARANCE_REGISTRY;
