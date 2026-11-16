import { resolveAllergen } from "@/lib/public-menu/allergens";
import type { PublicProduct } from "@/lib/public-menu/product-variants";

/**
 * Müşteri menüsü filtre/sıralama (Faz 2.2). Tamamen tarayıcıda çalışır; sunucuya bir şey gitmez.
 *
 * - "İçermesin" (alerjen): seçilen alerjenlerden birini içeren ürünler gizlenir.
 *   Alerjen bilgisi girilmemiş ürün "içermiyor" sayılır → arayüzde uyarı gösterilmeli.
 * - Tercih (diyet): ürün seçilen TÜM tercihlere uymalı (vegan ürün vejetaryen sayılır).
 */

export const DIET_FILTERS = [
  { id: "vegan", icon: "🌱", tr: "Vegan", en: "Vegan", ru: "Веган" },
  { id: "vegetarian", icon: "🥬", tr: "Vejetaryen", en: "Vegetarian", ru: "Вегетарианское" },
  { id: "spicy", icon: "🌶️", tr: "Acı", en: "Spicy", ru: "Острое" },
] as const;

export type DietFilterId = (typeof DIET_FILTERS)[number]["id"];

/** Alerjen listesinde de tutulabilen ama alerjen olmayan etiketler (filtrede "tercih" tarafında). */
const NON_ALLERGEN_TAGS = new Set(["vegan", "spicy"]);

export const MENU_SORTS = ["default", "price_asc", "price_desc", "name"] as const;
export type MenuSort = (typeof MENU_SORTS)[number];

export type MenuFilterState = {
  excludeAllergens: string[];
  diets: DietFilterId[];
  sort: MenuSort;
};

export const EMPTY_MENU_FILTER: MenuFilterState = { excludeAllergens: [], diets: [], sort: "default" };

export function activeFilterCount(state: MenuFilterState): number {
  return state.excludeAllergens.length + state.diets.length;
}

/**
 * "120", "120 ₺", "1.250", "1.250,50", "12,5", "₺ 99.90" → sayı.
 * Türkçe yazımda nokta binlik, virgül ondalık ayırıcıdır; yalnız nokta + 1-2 hane ondalık sayılır.
 */
export function parsePriceNumber(raw: string | null | undefined): number | null {
  const s = (raw ?? "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  let normalized: string;
  if (s.includes(",")) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, "");
  } else {
    normalized = s;
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Ürünün fiyat aralığı (boyutlu ürünlerde varyantlardan). Fiyatı yoksa null. */
export function productPriceRange(product: PublicProduct): { min: number; max: number } | null {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const nums = (variants.length > 0 ? variants.map((v) => v.price) : [product.price])
    .map((p) => parsePriceNumber(p))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function productAllergenIds(product: PublicProduct): Set<string> {
  const ids = new Set<string>();
  for (const raw of product.allergens ?? []) {
    const resolved = resolveAllergen(raw, "tr");
    if (resolved) ids.add(resolved.id);
  }
  return ids;
}

function productMatchesDiet(product: PublicProduct, diet: DietFilterId, allergenIds: Set<string>): boolean {
  const badges = new Set(product.badges ?? []);
  if (diet === "vegan") return badges.has("vegan") || allergenIds.has("vegan");
  if (diet === "vegetarian") {
    return badges.has("vegetarian") || badges.has("vegan") || allergenIds.has("vegan");
  }
  return badges.has("spicy") || allergenIds.has("spicy");
}

export function productPassesFilter(product: PublicProduct, state: MenuFilterState): boolean {
  if (state.excludeAllergens.length === 0 && state.diets.length === 0) return true;
  const allergenIds = productAllergenIds(product);
  if (state.excludeAllergens.some((id) => allergenIds.has(id))) return false;
  return state.diets.every((diet) => productMatchesDiet(product, diet, allergenIds));
}

/** Filtre + sıralama. Sıralama kararlıdır; fiyatı olmayan ürünler sona kalır. */
export function applyMenuFilter(
  products: PublicProduct[],
  state: MenuFilterState,
  getName: (product: PublicProduct) => string = (p) => p.name
): PublicProduct[] {
  const filtered = products.filter((p) => productPassesFilter(p, state));
  if (state.sort === "default") return filtered;

  const indexed = filtered.map((product, index) => ({ product, index }));
  const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
  indexed.sort((a, b) => {
    if (state.sort === "name") {
      return collator.compare(getName(a.product), getName(b.product)) || a.index - b.index;
    }
    const pa = productPriceRange(a.product)?.min ?? null;
    const pb = productPriceRange(b.product)?.min ?? null;
    if (pa === null && pb === null) return a.index - b.index;
    if (pa === null) return 1;
    if (pb === null) return -1;
    const diff = state.sort === "price_asc" ? pa - pb : pb - pa;
    return diff || a.index - b.index;
  });
  return indexed.map((x) => x.product);
}

/** Menüde gerçekten geçen alerjenler ve tercihler (boş seçenek gösterilmesin). */
export function availableFilterOptions(products: PublicProduct[]): {
  allergens: string[];
  diets: DietFilterId[];
} {
  const allergens = new Set<string>();
  const diets = new Set<DietFilterId>();
  for (const product of products) {
    const ids = productAllergenIds(product);
    for (const id of ids) if (!NON_ALLERGEN_TAGS.has(id)) allergens.add(id);
    for (const diet of DIET_FILTERS) {
      if (productMatchesDiet(product, diet.id, ids)) diets.add(diet.id);
    }
  }
  return {
    allergens: [...allergens].sort(),
    diets: DIET_FILTERS.filter((d) => diets.has(d.id)).map((d) => d.id),
  };
}

/**
 * Boyutlu ürün için kartta gösterilecek fiyat aralığı: en ucuz ve en pahalı varyantın
 * ham fiyat metinleri. Tek fiyat ya da hepsi aynıysa null (aralık gösterilmez).
 */
export function variantPriceRangeRaw(product: PublicProduct): { min: string; max: string } | null {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const priced = variants
    .map((v) => ({ raw: v.price, num: parsePriceNumber(v.price) }))
    .filter((x): x is { raw: string; num: number } => x.num !== null);
  if (priced.length < 2) return null;
  const min = priced.reduce((a, b) => (b.num < a.num ? b : a));
  const max = priced.reduce((a, b) => (b.num > a.num ? b : a));
  if (min.num === max.num) return null;
  return { min: min.raw, max: max.raw };
}
