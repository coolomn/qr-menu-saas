/**
 * Admin kategori sıralaması (alt kategori farkında) — Faz 2.2.
 *
 * Müşteri menüsü üst kategorileri kendi aralarında, alt kategorileri de üst kategorisinin içinde
 * `sort_order`'a göre gösterir. Admin listesi bu yüzden ağaç sırasıyla çizilir: her üst kategori,
 * hemen ardından kendi alt kategorileri. Taşıma yalnız kardeşler arasında yapılır; üst kategori
 * taşınınca alt kategorileri de onunla birlikte gider.
 */

type Node = { id: string; parent_id?: string | null };

function parentKey(c: Node, ids: Set<string>): string | null {
  return c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
}

/** Gelen sırayı koruyarak ağaç sırasına dizer (üst kategorisi listede olmayan alt kategori üst seviye sayılır). */
export function orderCategoryTree<T extends Node>(categories: T[]): T[] {
  const ids = new Set(categories.map((c) => c.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const c of categories) {
    const p = parentKey(c, ids);
    if (p == null) roots.push(c);
    else children.set(p, [...(children.get(p) ?? []), c]);
  }
  return roots.flatMap((r) => [r, ...(children.get(r.id) ?? [])]);
}

/** Kategorinin kardeş grubunun (aynı üst kategori) ağaç sırasındaki id'leri. */
function siblingIds<T extends Node>(tree: T[], id: string): string[] {
  const ids = new Set(tree.map((c) => c.id));
  const self = tree.find((c) => c.id === id);
  if (!self) return [];
  const p = parentKey(self, ids);
  return tree.filter((c) => parentKey(c, ids) === p).map((c) => c.id);
}

/** Kategorinin kardeşleri içindeki konumu (ok düğmelerini etkin/pasif yapmak için). */
export function categorySiblingPosition<T extends Node>(
  categories: T[],
  id: string
): { index: number; count: number } {
  const sibs = siblingIds(orderCategoryTree(categories), id);
  return { index: sibs.indexOf(id), count: sibs.length };
}

/** Kardeş grubunu yeni sıraya göre yeniden kurar; üst kategorinin alt kategorileri onunla gider. */
function rebuild<T extends Node>(tree: T[], reorderedSiblings: string[]): T[] {
  const ids = new Set(tree.map((c) => c.id));
  const first = tree.find((c) => c.id === reorderedSiblings[0]);
  if (!first) return tree;
  const p = parentKey(first, ids);
  if (p != null) {
    // Alt kategoriler: üst kategorinin bloğu içinde yer değiştirir.
    const byId = new Map(tree.map((c) => [c.id, c]));
    const others = tree.filter((c) => parentKey(c, ids) !== p);
    const parentIdx = others.findIndex((c) => c.id === p);
    const block = reorderedSiblings.map((sid) => byId.get(sid)!);
    return [...others.slice(0, parentIdx + 1), ...block, ...others.slice(parentIdx + 1)];
  }
  // Üst kategoriler: her biri alt kategorileriyle birlikte taşınır.
  const blocks = new Map<string, T[]>();
  for (const c of tree) {
    const owner = parentKey(c, ids) ?? c.id;
    blocks.set(owner, [...(blocks.get(owner) ?? []), c]);
  }
  return reorderedSiblings.flatMap((sid) => blocks.get(sid) ?? []);
}

/** Kategoriyi kardeşleri arasında bir yukarı (-1) / aşağı (+1) taşır. Taşınamıyorsa null. */
export function moveCategoryInTree<T extends Node>(categories: T[], id: string, direction: -1 | 1): T[] | null {
  const tree = orderCategoryTree(categories);
  const sibs = siblingIds(tree, id);
  const i = sibs.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= sibs.length) return null;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  return rebuild(tree, sibs);
}

/**
 * Sürükle-bırak: kaynağı hedefin yerine koyar. Yalnız aynı üst kategorinin kardeşleri arasında
 * izinlidir (alt kategoriyi başka üst kategoriye taşımak düzenleme formundan yapılır). Değilse null.
 */
export function dropCategoryInTree<T extends Node>(categories: T[], sourceId: string, targetId: string): T[] | null {
  if (sourceId === targetId) return null;
  const tree = orderCategoryTree(categories);
  const sibs = siblingIds(tree, sourceId);
  const si = sibs.indexOf(sourceId);
  const ti = sibs.indexOf(targetId);
  if (si < 0 || ti < 0) return null;
  sibs.splice(si, 1);
  sibs.splice(ti, 0, sourceId);
  return rebuild(tree, sibs);
}
