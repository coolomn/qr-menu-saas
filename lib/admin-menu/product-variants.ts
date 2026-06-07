import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPriceForDisplay } from "@/lib/format-price";

export const MAX_PRODUCT_VARIANTS = 20;

export type PricingMode = "single" | "variants";

/** Owner modal form satırı — kayıt öncesi client state. */
export type EditableProductVariant = {
  label: string;
  price: string;
};

/** Owner panel / DB katmanı — tam varyant satırı. */
export type ProductVariant = {
  id: string;
  product_id: string;
  restaurant_id: string;
  label: string;
  label_en: string | null;
  label_ru: string | null;
  price: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
};

/** Public menü API — müşteriye gösterilecek alanlar (Faz 3+). */
export type PublicProductVariant = Pick<
  ProductVariant,
  "id" | "label" | "label_en" | "label_ru" | "price" | "sort_order"
>;

export type ProductVariantSortable = {
  sort_order?: number | null;
  created_at?: string | null;
  label?: string | null;
};

export function compareProductVariantsBySortOrder(
  a: ProductVariantSortable,
  b: ProductVariantSortable
): number {
  const sa = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
  const sb = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (ca !== cb) return ca - cb;
  return (a.label || "").localeCompare(b.label || "", "tr");
}

export function sortProductVariantsByOrder<T extends ProductVariantSortable>(variants: T[]): T[] {
  return [...variants].sort(compareProductVariantsBySortOrder);
}

export function toPublicProductVariant(row: ProductVariant): PublicProductVariant {
  return {
    id: row.id,
    label: row.label,
    label_en: row.label_en,
    label_ru: row.label_ru,
    price: row.price,
    sort_order: row.sort_order,
  };
}

/** Fiyat metninden karşılaştırma için sayı çıkarır (ör. "350 ₺" → 350). */
export function extractNumericPrice(raw: string | null | undefined): number | null {
  const s = raw == null ? "" : String(raw).trim();
  if (!s) return null;
  const normalized = s.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!normalized) return null;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

type VariantPriceLike = {
  price: string;
  is_active?: boolean;
};

/**
 * Aktif varyantlardan fiyat özeti üretir.
 * - 0 geçerli fiyat: ""
 * - 1 fiyat: "350 ₺"
 * - 2+ farklı fiyat: "350 ₺ – 950 ₺"
 * - 2+ aynı fiyat: tek fiyat
 */
export function formatProductVariantPriceRange(
  variants: VariantPriceLike[],
  options?: { includeInactive?: boolean }
): string {
  const includeInactive = options?.includeInactive ?? false;
  const priced = variants
    .filter((v) => includeInactive || v.is_active !== false)
    .map((v) => ({ raw: v.price, num: extractNumericPrice(v.price) }))
    .filter((v) => v.num != null) as { raw: string; num: number }[];

  if (priced.length === 0) return "";

  const nums = priced.map((p) => p.num);
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  const minRaw = priced.find((p) => p.num === min)?.raw ?? String(min);
  const maxRaw = priced.find((p) => p.num === max)?.raw ?? String(max);

  if (min === max) return formatPriceForDisplay(minRaw);
  return `${formatPriceForDisplay(minRaw)} – ${formatPriceForDisplay(maxRaw)}`;
}

/** Ürünün en düşük aktif varyant fiyatını metin olarak döner (products.price senkronu için). */
export function minActiveVariantPrice(variants: VariantPriceLike[]): string {
  const active = variants.filter((v) => v.is_active !== false);
  let best: { raw: string; num: number } | null = null;

  for (const v of active) {
    const trimmed = (v.price || "").trim();
    if (!trimmed) continue;
    const num = extractNumericPrice(trimmed);
    if (num == null) {
      if (!best) return trimmed;
      continue;
    }
    if (!best || num < best.num) {
      best = { raw: trimmed, num };
    }
  }

  return best?.raw ?? "";
}

export function hasProductVariants(variants: unknown[] | null | undefined): boolean {
  return Array.isArray(variants) && variants.length > 0;
}

export function createEmptyVariantRow(): EditableProductVariant {
  return { label: "", price: "" };
}

export function validateProductVariantsForSave(
  mode: PricingMode,
  singlePrice: string,
  variants: EditableProductVariant[]
): string | null {
  if (mode === "single") {
    if (!(singlePrice || "").trim()) return "Fiyat zorunludur.";
    return null;
  }
  if (variants.length === 0) return "En az bir varyant ekleyin.";
  if (variants.length > MAX_PRODUCT_VARIANTS) {
    return `En fazla ${MAX_PRODUCT_VARIANTS} varyant eklenebilir.`;
  }
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (!(v.label || "").trim()) return `Varyant ${i + 1}: etiket zorunludur.`;
    if (!(v.price || "").trim()) return `Varyant ${i + 1}: fiyat zorunludur.`;
  }
  return null;
}

export function buildProductVariantsMap(rows: ProductVariant[]): Record<string, ProductVariant[]> {
  const map: Record<string, ProductVariant[]> = {};
  for (const row of rows) {
    if (!map[row.product_id]) map[row.product_id] = [];
    map[row.product_id].push(row);
  }
  for (const pid of Object.keys(map)) {
    map[pid] = sortProductVariantsByOrder(map[pid]);
  }
  return map;
}

export async function replaceProductVariants(
  supabase: SupabaseClient,
  params: {
    productId: string;
    restaurantId: string;
    mode: PricingMode;
    variants: EditableProductVariant[];
  }
): Promise<{ ok: true; rows: ProductVariant[] } | { ok: false; error: string }> {
  const { productId, restaurantId, mode, variants } = params;

  const { data: backupRows, error: backupErr } = await supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", productId);

  if (backupErr) {
    return { ok: false, error: backupErr.message || "Mevcut varyantlar okunamadı." };
  }

  const backup = sortProductVariantsByOrder((backupRows || []) as ProductVariant[]);

  const { error: delErr } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", productId);

  if (delErr) {
    return { ok: false, error: delErr.message || "Varyantlar silinemedi." };
  }

  if (mode === "single") {
    return { ok: true, rows: [] };
  }

  const insertRows = variants.map((v, index) => ({
    product_id: productId,
    restaurant_id: restaurantId,
    label: v.label.trim(),
    label_en: null as string | null,
    label_ru: null as string | null,
    price: v.price.trim(),
    sort_order: index,
    is_active: true,
  }));

  const { data, error: insErr } = await supabase
    .from("product_variants")
    .insert(insertRows)
    .select("*");

  if (insErr) {
    if (backup.length > 0) {
      const restoreRows = backup.map((row) => ({
        product_id: row.product_id,
        restaurant_id: row.restaurant_id,
        label: row.label,
        label_en: row.label_en,
        label_ru: row.label_ru,
        price: row.price,
        sort_order: row.sort_order,
        is_active: row.is_active,
      }));
      await supabase.from("product_variants").insert(restoreRows);
    }
    return { ok: false, error: insErr.message || "Varyantlar kaydedilemedi." };
  }

  return { ok: true, rows: sortProductVariantsByOrder((data || []) as ProductVariant[]) };
}
