export type ProductSortable = {
  id: string;
  category_id: string;
  sort_order?: number | null;
  created_at?: string | null;
  name?: string | null;
};

export function compareProductsBySortOrder(a: ProductSortable, b: ProductSortable): number {
  const sa = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
  const sb = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
  const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
  if (ca !== cb) return ca - cb;
  return (a.name || "").localeCompare(b.name || "", "tr");
}

export function sortProductsByOrder<T extends ProductSortable>(products: T[]): T[] {
  return [...products].sort(compareProductsBySortOrder);
}

export function nextProductSortOrderInCategory(
  products: ProductSortable[],
  categoryId: string
): number {
  let max = -1;
  for (const p of products) {
    if (p.category_id !== categoryId) continue;
    if (typeof p.sort_order === "number" && p.sort_order > max) max = p.sort_order;
  }
  return max + 1;
}
