import type { SupabaseClient } from "@supabase/supabase-js";

type ProductJunctionRow = {
  product_id: string;
  menu_collection_id: string;
};

function isDbSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01") return true;
  const msg = error.message || "";
  return /column|relation|schema cache|does not exist/i.test(msg);
}

function toProductJunctionRows(value: unknown): ProductJunctionRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ProductJunctionRow => {
    if (typeof row !== "object" || row === null) return false;
    const r = row as Record<string, unknown>;
    return typeof r.product_id === "string" && typeof r.menu_collection_id === "string";
  });
}

export type ProductMenuCollectionsMaps = {
  menuIdsByProduct: Map<string, string[]>;
  productsWithJunction: Set<string>;
};

/**
 * Loads product ↔ menu junctions for the public menu API.
 * Returns only active menu_collection ids per product.
 * productsWithJunction lists products that have at least one junction row (any menu).
 */
export async function buildProductMenuCollectionsMaps(
  supabase: SupabaseClient,
  productIds: string[],
  activeMenuIdSet: Set<string>
): Promise<ProductMenuCollectionsMaps> {
  const empty: ProductMenuCollectionsMaps = {
    menuIdsByProduct: new Map(),
    productsWithJunction: new Set(),
  };

  if (productIds.length === 0 || activeMenuIdSet.size === 0) {
    return empty;
  }

  const { data: junctionRows, error: junctionError } = await supabase
    .from("product_menu_collections")
    .select("product_id, menu_collection_id")
    .in("product_id", productIds);

  if (junctionError) {
    if (isDbSchemaError(junctionError)) {
      console.warn("product_menu_collections unavailable for public menu:", junctionError.message);
      return empty;
    }
    console.error(junctionError);
    return empty;
  }

  const menuIdsByProduct = new Map<string, string[]>();
  const productsWithJunction = new Set<string>();

  for (const link of toProductJunctionRows(junctionRows)) {
    productsWithJunction.add(link.product_id);
    if (!activeMenuIdSet.has(link.menu_collection_id)) continue;

    const list = menuIdsByProduct.get(link.product_id) ?? [];
    if (!list.includes(link.menu_collection_id)) {
      list.push(link.menu_collection_id);
    }
    menuIdsByProduct.set(link.product_id, list);
  }

  return { menuIdsByProduct, productsWithJunction };
}

/**
 * Attaches menu_collection_ids to products.
 * Direct junction overrides; otherwise inherits category menu ids; then default menu fallback.
 */
export function attachProductMenuCollectionIds<T extends { id: string; category_id: string }>(
  products: T[],
  menuIdsByProduct: Map<string, string[]>,
  productsWithJunction: Set<string>,
  menuIdsByCategory: Map<string, string[]>,
  defaultMenuCollectionId: string | null
): (T & { menu_collection_ids: string[] })[] {
  return products.map((product) => {
    let ids: string[];

    if (productsWithJunction.has(product.id)) {
      ids = [...(menuIdsByProduct.get(product.id) ?? [])];
    } else {
      ids = [...(menuIdsByCategory.get(product.category_id) ?? [])];
    }

    if (ids.length === 0 && defaultMenuCollectionId) {
      ids = [defaultMenuCollectionId];
    }

    return {
      ...product,
      menu_collection_ids: ids,
    };
  });
}
