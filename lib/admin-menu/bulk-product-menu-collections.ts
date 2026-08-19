import { areMenuCollectionsAllowedForCategory } from "@/lib/admin-menu/helpers";

export type BulkMenuCollectionAction = "add" | "remove";

export type BulkProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
};

export type BulkMenuRow = {
  id: string;
  restaurant_id: string;
  is_active: boolean;
};

export type ProductMenuLink = {
  product_id: string;
  menu_collection_id: string;
};

export type IncompatibleCategoryMenu = {
  categoryId: string;
  categoryName: string;
  menuName: string;
};

export function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function findIncompatibleBulkAddTargets(input: {
  products: { id: string; category_id: string }[];
  menuCollectionIds: string[];
  availableMenuIdsByCategory: Map<string, string[]>;
  categoryNames: Record<string, string>;
  menuNames: Record<string, string>;
}): IncompatibleCategoryMenu[] {
  const seen = new Set<string>();
  const result: IncompatibleCategoryMenu[] = [];

  for (const product of input.products) {
    const available = input.availableMenuIdsByCategory.get(product.category_id) || [];
    for (const menuId of uniqueIds(input.menuCollectionIds)) {
      if (areMenuCollectionsAllowedForCategory(available, [menuId])) continue;
      const key = `${product.category_id}:${menuId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        categoryId: product.category_id,
        categoryName: input.categoryNames[product.category_id] || "Kategori",
        menuName: input.menuNames[menuId] || "Menü",
      });
    }
  }

  return result;
}

export function formatIncompatibleBulkAddError(items: IncompatibleCategoryMenu[]): string {
  const first = items[0];
  if (!first) {
    return "Seçilen menüler bu kategorinin bağlı olduğu menüler arasında değil.";
  }
  return (
    `${first.categoryName} kategorisi ${first.menuName}'ne bağlı değil.\n` +
    `Bu ürün müşteri menüsünde görünmez. Önce kategoriyi ${first.menuName}'ne bağlayın.`
  );
}

export function assertBulkTargetOwnership(input: {
  restaurantId: string;
  requestedProductIds: string[];
  products: BulkProductRow[];
  requestedMenuIds: string[];
  menus: BulkMenuRow[];
}): { ok: true } | { ok: false; status: number; error: string } {
  const productIds = uniqueIds(input.requestedProductIds);
  const menuIds = uniqueIds(input.requestedMenuIds);
  const productsById = new Map(input.products.map((p) => [p.id, p]));
  const menusById = new Map(input.menus.map((m) => [m.id, m]));

  for (const id of productIds) {
    const product = productsById.get(id);
    if (!product) {
      return { ok: false, status: 403, error: "Ürünler seçili restorana ait değil." };
    }
    if (product.restaurant_id !== input.restaurantId) {
      return { ok: false, status: 403, error: "Ürünler seçili restorana ait değil." };
    }
  }

  for (const id of menuIds) {
    const menu = menusById.get(id);
    if (!menu) {
      return { ok: false, status: 403, error: "Menüler seçili restorana ait değil." };
    }
    if (menu.restaurant_id !== input.restaurantId) {
      return { ok: false, status: 403, error: "Menüler seçili restorana ait değil." };
    }
    if (!menu.is_active) {
      return { ok: false, status: 400, error: "Seçilen menülerden biri geçersiz veya pasif." };
    }
  }

  return { ok: true };
}

function linkKey(productId: string, menuId: string): string {
  return `${productId}:${menuId}`;
}

export function planBulkProductMenuCollectionChanges(input: {
  action: BulkMenuCollectionAction;
  productIds: string[];
  menuCollectionIds: string[];
  products: { id: string; category_id: string }[];
  existingLinks: ProductMenuLink[];
  availableMenuIdsByCategory: Map<string, string[]>;
}): {
  toInsert: ProductMenuLink[];
  toDelete: ProductMenuLink[];
  linksAdded: number;
  linksRemoved: number;
  skippedUnavailable: number;
  linksByProduct: Record<string, string[]>;
} {
  const productIds = uniqueIds(input.productIds);
  const selectedMenus = uniqueIds(input.menuCollectionIds);
  const productsById = new Map(input.products.map((p) => [p.id, p]));

  const existingByProduct = new Map<string, Set<string>>();
  for (const id of productIds) existingByProduct.set(id, new Set());
  for (const link of input.existingLinks) {
    const set = existingByProduct.get(link.product_id);
    if (set) set.add(link.menu_collection_id);
  }

  const insertKeys = new Set<string>();
  const deleteKeys = new Set<string>();
  let skippedUnavailable = 0;
  const nextByProduct = new Map<string, Set<string>>();

  for (const productId of productIds) {
    const product = productsById.get(productId);
    const existing = existingByProduct.get(productId) ?? new Set<string>();
    const available = new Set(input.availableMenuIdsByCategory.get(product?.category_id || "") || []);
    const next = new Set(existing);

    if (input.action === "add") {
      if (existing.size === 0) {
        for (const menuId of available) next.add(menuId);
      }
      for (const menuId of selectedMenus) {
        if (!areMenuCollectionsAllowedForCategory([...available], [menuId])) {
          skippedUnavailable += 1;
          continue;
        }
        next.add(menuId);
      }
    } else {
      for (const menuId of selectedMenus) {
        next.delete(menuId);
      }
    }

    nextByProduct.set(productId, next);

    for (const menuId of next) {
      if (!existing.has(menuId)) insertKeys.add(linkKey(productId, menuId));
    }
    for (const menuId of existing) {
      if (!next.has(menuId)) deleteKeys.add(linkKey(productId, menuId));
    }
  }

  const toInsert: ProductMenuLink[] = [...insertKeys].map((key) => {
    const [product_id, menu_collection_id] = key.split(":");
    return { product_id, menu_collection_id };
  });
  const toDelete: ProductMenuLink[] = [...deleteKeys].map((key) => {
    const [product_id, menu_collection_id] = key.split(":");
    return { product_id, menu_collection_id };
  });

  const linksByProduct: Record<string, string[]> = {};
  for (const productId of productIds) {
    linksByProduct[productId] = [...(nextByProduct.get(productId) ?? [])];
  }

  return {
    toInsert,
    toDelete,
    linksAdded: toInsert.length,
    linksRemoved: toDelete.length,
    skippedUnavailable,
    linksByProduct,
  };
}

export type BulkMenuLinkCheckState = "all" | "some" | "none";

export function getBulkMenuLinkCheckState(
  menuId: string,
  selectedProductIds: string[],
  linksByProduct: Record<string, string[]>
): BulkMenuLinkCheckState {
  if (selectedProductIds.length === 0) return "none";

  let linkedCount = 0;
  for (const productId of selectedProductIds) {
    if ((linksByProduct[productId] || []).includes(menuId)) linkedCount += 1;
  }

  if (linkedCount === 0) return "none";
  if (linkedCount === selectedProductIds.length) return "all";
  return "some";
}

export function mergeProductMenuLinksMap(
  current: Record<string, string[]>,
  updates: Record<string, string[]>
): Record<string, string[]> {
  const next = { ...current };
  for (const [productId, ids] of Object.entries(updates)) {
    next[productId] = [...ids];
  }
  return next;
}

export function applyBulkMenuLinksToMap(
  current: Record<string, string[]>,
  productIds: string[],
  menuCollectionIds: string[],
  action: BulkMenuCollectionAction
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...current };
  for (const productId of productIds) {
    const set = new Set(next[productId] || []);
    if (action === "add") {
      for (const menuId of menuCollectionIds) set.add(menuId);
    } else {
      for (const menuId of menuCollectionIds) set.delete(menuId);
    }
    next[productId] = [...set];
  }
  return next;
}

export function formatBulkProductMenuResultMessage(input: {
  action: BulkMenuCollectionAction;
  productCount: number;
  linksAdded: number;
  linksRemoved: number;
}): string {
  if (input.action === "add") {
    return `${input.productCount} ürün güncellendi. ${input.linksAdded} menü bağlantısı eklendi.`;
  }
  return `${input.productCount} ürün seçili menülerden çıkarıldı.`;
}
