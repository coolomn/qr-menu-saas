import {
  hasProductVariants,
  sortProductVariantsByOrder,
  type ProductVariant,
} from "@/lib/admin-menu/product-variants";

export type BulkPriceProductGroup = {
  categoryId: string;
  categoryName: string;
  products: {
    id: string;
    name?: string | null;
    price?: string | null;
    category_id?: string | null;
    categories?: { name?: string | null } | null;
  }[];
};

export function bulkPriceProductKey(productId: string): string {
  return `p:${productId}`;
}

export function bulkPriceVariantKey(variantId: string): string {
  return `v:${variantId}`;
}

export function isProductPriceEmpty(
  productPrice: string | null | undefined,
  variants: ProductVariant[] | undefined
): boolean {
  if (hasProductVariants(variants)) {
    const active = sortProductVariantsByOrder(variants!).filter((v) => v.is_active !== false);
    if (active.length === 0) return true;
    return active.some((v) => !(v.price || "").trim());
  }
  return !(productPrice || "").trim();
}

export function buildBulkPriceDrafts(
  products: BulkPriceProductGroup["products"],
  variantsMap: Record<string, ProductVariant[]>
): {
  productPrices: Record<string, string>;
  variantPrices: Record<string, string>;
} {
  const productPrices: Record<string, string> = {};
  const variantPrices: Record<string, string> = {};

  for (const product of products) {
    const variants = variantsMap[product.id];
    if (hasProductVariants(variants)) {
      for (const variant of sortProductVariantsByOrder(variants!)) {
        variantPrices[variant.id] = variant.price ?? "";
      }
    } else {
      productPrices[product.id] = product.price ?? "";
    }
  }

  return { productPrices, variantPrices };
}

export function countEmptyPricesInGroups(
  groups: BulkPriceProductGroup[],
  variantsMap: Record<string, ProductVariant[]>
): number {
  let count = 0;
  for (const group of groups) {
    for (const product of group.products) {
      if (isProductPriceEmpty(product.price, variantsMap[product.id])) {
        count++;
      }
    }
  }
  return count;
}

export function countProductsInGroups(groups: BulkPriceProductGroup[]): number {
  return groups.reduce((n, g) => n + g.products.length, 0);
}
