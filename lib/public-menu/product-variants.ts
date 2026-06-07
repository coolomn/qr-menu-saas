import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sortProductVariantsByOrder,
  toPublicProductVariant,
  type ProductVariant,
  type PublicProductVariant,
} from "@/lib/admin-menu/product-variants";

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
    return { ...product, variants };
  });
}
