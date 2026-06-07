import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasProductVariants,
  sortProductVariantsByOrder,
  toPublicProductVariant,
  type ProductVariant,
  type PublicProductVariant,
} from "@/lib/admin-menu/product-variants";

export { hasProductVariants };
export type { PublicProductVariant };

const VARIANT_COLUMNS = [
  "id",
  "product_id",
  "label",
  "label_en",
  "label_ru",
  "price",
  "sort_order",
  "is_active",
  "created_at",
].join(",");

function isDbSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01") return true;
  const msg = error.message || "";
  return /column|relation|schema cache|does not exist/i.test(msg);
}

/** Aktif varyantları product_id → PublicProductVariant[] olarak toplu yükler. */
export async function buildActivePublicVariantsMap(
  supabase: SupabaseClient,
  productIds: string[]
): Promise<Map<string, PublicProductVariant[]>> {
  const empty = new Map<string, PublicProductVariant[]>();
  if (productIds.length === 0) return empty;

  const { data, error } = await supabase
    .from("product_variants")
    .select(VARIANT_COLUMNS)
    .in("product_id", productIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    if (isDbSchemaError(error)) {
      console.warn("product_variants unavailable for public menu:", error.message);
      return empty;
    }
    console.error(error);
    return empty;
  }

  const byProduct = new Map<string, PublicProductVariant[]>();
  for (const row of data || []) {
    if (typeof row !== "object" || row === null) continue;
    const typed = row as unknown as ProductVariant;
    const pid = typed.product_id;
    if (!pid) continue;
    const list = byProduct.get(pid) ?? [];
    list.push(toPublicProductVariant(typed));
    byProduct.set(pid, list);
  }

  for (const [pid, list] of byProduct) {
    byProduct.set(pid, sortProductVariantsByOrder(list));
  }

  return byProduct;
}

/** Varyantı olan ürünlere `variants` ekler; yoksa alan eklenmez (backward compatible). */
export function attachProductVariants<T extends { id: string }>(
  products: T[],
  variantsByProduct: Map<string, PublicProductVariant[]>
): (T & { variants?: PublicProductVariant[] })[] {
  return products.map((product) => {
    const variants = variantsByProduct.get(product.id);
    if (!variants?.length) return product;
    return { ...product, variants: [...variants] };
  });
}

export type PublicProduct = {
  id: string;
  category_id: string;
  name: string;
  name_en?: string | null;
  name_ru?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  price?: string | null;
  image_url?: string | null;
  allergens?: string[] | null;
  menu_collection_ids?: string[];
  sort_order?: number | null;
  variants?: PublicProductVariant[];
};

function isPublicProductVariant(value: unknown): value is PublicProductVariant {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.label === "string";
}

function parseVariantsField(raw: unknown): PublicProductVariant[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const parsed = raw.filter(isPublicProductVariant);
  if (parsed.length === 0) return undefined;
  return sortProductVariantsByOrder(parsed);
}

/** Client fetch sonrası variants alanını korur ve sıralar. */
export function normalizePublicProduct(raw: unknown): PublicProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.category_id !== "string" || typeof row.name !== "string") {
    return null;
  }

  const variants = parseVariantsField(row.variants);
  const base: PublicProduct = {
    id: row.id,
    category_id: row.category_id,
    name: row.name,
    name_en: (row.name_en as string | null | undefined) ?? null,
    name_ru: (row.name_ru as string | null | undefined) ?? null,
    description: (row.description as string | null | undefined) ?? null,
    description_en: (row.description_en as string | null | undefined) ?? null,
    description_ru: (row.description_ru as string | null | undefined) ?? null,
    price: (row.price as string | null | undefined) ?? null,
    image_url: (row.image_url as string | null | undefined) ?? null,
    allergens: Array.isArray(row.allergens) ? (row.allergens as string[]) : null,
    menu_collection_ids: Array.isArray(row.menu_collection_ids)
      ? (row.menu_collection_ids as string[])
      : undefined,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : null,
  };

  return variants ? { ...base, variants } : base;
}

export function normalizePublicProducts(raw: unknown): PublicProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePublicProduct).filter((p): p is PublicProduct => p !== null);
}
