"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PublicModifierGroup } from "@/lib/public-menu/product-extras";
import type { PublicProduct } from "@/lib/public-menu/product-variants";

/**
 * Faz 2.4: ürün detayının seçenek gruplarını ve önerilen ürünleri çözebilmesi için menü verisi.
 * Sağlayıcı yoksa (eski kullanım) detay kartı bu bölümleri göstermez.
 */
type ProductExtrasContextValue = {
  groupsById: Map<string, PublicModifierGroup>;
  productsById: Map<string, PublicProduct>;
};

const ProductExtrasContext = createContext<ProductExtrasContextValue | null>(null);

export function ProductExtrasProvider({
  groups,
  products,
  children,
}: {
  groups: PublicModifierGroup[] | undefined;
  products: PublicProduct[];
  children: ReactNode;
}) {
  const value = useMemo<ProductExtrasContextValue>(
    () => ({
      groupsById: new Map((groups ?? []).map((g) => [g.id, g])),
      productsById: new Map(products.map((p) => [p.id, p])),
    }),
    [groups, products]
  );
  return <ProductExtrasContext.Provider value={value}>{children}</ProductExtrasContext.Provider>;
}

export function useProductExtras(): ProductExtrasContextValue | null {
  return useContext(ProductExtrasContext);
}
