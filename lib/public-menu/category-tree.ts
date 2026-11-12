/**
 * Alt kategori (tek seviye) yardımcıları — Faz 2.2.
 * Müşteri menüsünde sekmelerde yalnız üst kategoriler görünür; alt kategoriler üst kategorinin
 * sayfasında başlık + ürün grubu olarak listelenir.
 */

type TreeNode = { id: string; parent_id?: string | null };

/**
 * Üst kategorisi listede olmayan (gizlenmiş/pasif) alt kategorileri çıkarır:
 * üst kategoriyi gizleyen işletme, altındakilerin de gizlenmesini bekler.
 */
export function dropHiddenSubcategories<T extends TreeNode>(categories: T[]): T[] {
  const ids = new Set(categories.map((c) => c.id));
  return categories.filter((c) => !c.parent_id || ids.has(c.parent_id));
}

export function isTopLevelCategory(category: TreeNode): boolean {
  return !category.parent_id;
}

/** Üst kategori id → alt kategoriler (gelen sıra korunur). */
export function childrenByParent<T extends TreeNode>(categories: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const c of categories) {
    if (!c.parent_id) continue;
    const list = map.get(c.parent_id) ?? [];
    list.push(c);
    map.set(c.parent_id, list);
  }
  return map;
}
