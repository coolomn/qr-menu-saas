import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Menü sıfırlamadan önce menünün tam kopyasını (JSON) `menu_snapshots` tablosuna alır;
 * master panelden geri yüklenebilir. Tablo yalnızca service_role ile erişilir.
 */

type Row = Record<string, unknown>;

export const SNAPSHOT_VERSION = 1;
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 200;

export type MenuSnapshotData = {
  version: number;
  categories: Row[];
  menu_collections: Row[];
  category_menu_collections: Row[];
  products: Row[];
  product_variants: Row[];
  product_menu_collections: Row[];
  /** Faz 2.4 (eski yedeklerde yok). Gruplar işletme düzeyindedir; sıfırlamada silinmez. */
  modifier_groups?: Row[];
  modifier_options?: Row[];
  product_modifier_groups?: Row[];
  product_pairings?: Row[];
};

export type MenuSnapshotCounts = {
  categories: number;
  products: number;
  product_variants: number;
  menu_collections: number;
};

export type MenuSnapshotSummary = {
  id: string;
  reason: string;
  counts: MenuSnapshotCounts;
  created_at: string;
  expires_at: string;
};

export type CreateSnapshotResult =
  | { ok: true; snapshotId: string | null; counts: MenuSnapshotCounts }
  | { ok: false; error: string };

export type RestoreSnapshotResult =
  | { ok: true; counts: MenuSnapshotCounts }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string };

async function fetchAll(
  admin: SupabaseClient,
  table: string,
  filter: { column: string; values: string[] } | { column: string; value: string },
  orderBy: string[]
): Promise<{ ok: true; rows: Row[] } | { ok: false; error: string }> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin.from(table).select("*");
    query =
      "values" in filter
        ? query.in(filter.column, filter.values)
        : query.eq(filter.column, filter.value);
    for (const col of orderBy) {
      query = query.order(col, { ascending: true });
    }
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`[menu-snapshot] ${table} okunamadı:`, error);
      return { ok: false, error: `${table} okunamadı.` };
    }
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { ok: true, rows };
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42P01" || /relation .* does not exist|schema cache/i.test(error?.message || "");
}

/** Faz 2.4 tabloları: migration henüz yoksa boş sayılır (sıfırlama engellenmesin). */
async function fetchAllOptional(admin: SupabaseClient, table: string, restaurantId: string, orderBy: string[]) {
  const { error } = await admin.from(table).select("restaurant_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
  if (error && isMissingTable(error)) return { ok: true as const, rows: [] as Row[] };
  return fetchAll(admin, table, { column: "restaurant_id", value: restaurantId }, orderBy);
}

function countsOf(data: MenuSnapshotData): MenuSnapshotCounts {
  return {
    categories: data.categories.length,
    products: data.products.length,
    product_variants: data.product_variants.length,
    menu_collections: data.menu_collections.length,
  };
}

function ids(rows: Row[], key = "id"): string[] {
  return rows.map((r) => String(r[key]));
}

/**
 * Restoranın menüsünü okuyup yedekler. Menü tamamen boşsa yedek almaz (snapshotId: null).
 * Herhangi bir okuma/yazma hatasında ok:false döner; çağıran silme işlemini YAPMAMALI.
 */
export async function createMenuSnapshot(
  admin: SupabaseClient,
  restaurantId: string,
  reason = "menu_reset"
): Promise<CreateSnapshotResult> {
  const categories = await fetchAll(admin, "categories", { column: "restaurant_id", value: restaurantId }, ["id"]);
  if (!categories.ok) return categories;
  const products = await fetchAll(admin, "products", { column: "restaurant_id", value: restaurantId }, ["id"]);
  if (!products.ok) return products;
  const variants = await fetchAll(admin, "product_variants", { column: "restaurant_id", value: restaurantId }, ["id"]);
  if (!variants.ok) return variants;
  const collections = await fetchAll(admin, "menu_collections", { column: "restaurant_id", value: restaurantId }, ["id"]);
  if (!collections.ok) return collections;

  const groups = await fetchAllOptional(admin, "modifier_groups", restaurantId, ["id"]);
  if (!groups.ok) return groups;
  const options = await fetchAllOptional(admin, "modifier_options", restaurantId, ["id"]);
  if (!options.ok) return options;
  const groupLinks = await fetchAllOptional(admin, "product_modifier_groups", restaurantId, ["product_id", "group_id"]);
  if (!groupLinks.ok) return groupLinks;
  const pairings = await fetchAllOptional(admin, "product_pairings", restaurantId, ["product_id", "paired_product_id"]);
  if (!pairings.ok) return pairings;

  const collectionIds = ids(collections.rows);
  let categoryJunctions: Row[] = [];
  let productJunctions: Row[] = [];
  if (collectionIds.length > 0) {
    const cj = await fetchAll(
      admin,
      "category_menu_collections",
      { column: "menu_collection_id", values: collectionIds },
      ["category_id", "menu_collection_id"]
    );
    if (!cj.ok) return cj;
    categoryJunctions = cj.rows;
    const pj = await fetchAll(
      admin,
      "product_menu_collections",
      { column: "menu_collection_id", values: collectionIds },
      ["product_id", "menu_collection_id"]
    );
    if (!pj.ok) return pj;
    productJunctions = pj.rows;
  }

  const data: MenuSnapshotData = {
    version: SNAPSHOT_VERSION,
    categories: categories.rows,
    menu_collections: collections.rows,
    category_menu_collections: categoryJunctions,
    products: products.rows,
    product_variants: variants.rows,
    product_menu_collections: productJunctions,
    modifier_groups: groups.rows,
    modifier_options: options.rows,
    product_modifier_groups: groupLinks.rows,
    product_pairings: pairings.rows,
  };

  // Silinecek bir şey yoksa yedeğe gerek yok.
  if (data.categories.length === 0 && data.products.length === 0) {
    return { ok: true, snapshotId: null, counts: countsOf(data) };
  }

  const counts = countsOf(data);
  const { data: inserted, error } = await admin
    .from("menu_snapshots")
    .insert({ restaurant_id: restaurantId, reason, counts, data })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[menu-snapshot] yedek yazılamadı:", error);
    return { ok: false, error: "Menü yedeği alınamadı." };
  }
  return { ok: true, snapshotId: String((inserted as { id: string }).id), counts };
}

export async function listMenuSnapshots(
  admin: SupabaseClient,
  restaurantId: string
): Promise<{ ok: true; snapshots: MenuSnapshotSummary[] } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("menu_snapshots")
    .select("id, reason, counts, created_at, expires_at")
    .eq("restaurant_id", restaurantId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[menu-snapshot] liste okunamadı:", error);
    return { ok: false, error: "Yedekler okunamadı." };
  }
  return { ok: true, snapshots: (data ?? []) as MenuSnapshotSummary[] };
}

function chunk<T>(items: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** parent_id'si olmayan kategoriler önce (sıra kendi içinde korunur). */
export function parentsFirst(rows: Row[]): Row[] {
  return [...rows.filter((r) => !r.parent_id), ...rows.filter((r) => Boolean(r.parent_id))];
}

async function writeRows(
  admin: SupabaseClient,
  table: string,
  rows: Row[],
  mode: "insert" | "upsert-ignore",
  conflict?: string
): Promise<string | null> {
  if (rows.length === 0) return null;
  for (const part of chunk(rows)) {
    const { error } =
      mode === "insert"
        ? await admin.from(table).insert(part)
        : await admin.from(table).upsert(part, { onConflict: conflict, ignoreDuplicates: true });
    if (error) {
      console.error(`[menu-snapshot] ${table} geri yazılamadı:`, error);
      return `${table} geri yazılamadı.`;
    }
  }
  return null;
}

/** Hata olursa bu geri yüklemede eklenen satırları (restoran önceden boştu) geri siler. */
async function rollbackRestore(admin: SupabaseClient, restaurantId: string, data: MenuSnapshotData) {
  const productIds = ids(data.products);
  for (const part of chunk(productIds)) {
    await admin.from("product_menu_collections").delete().in("product_id", part);
    await admin.from("product_variants").delete().in("product_id", part);
    if ((data.product_modifier_groups ?? []).length > 0) {
      await admin.from("product_modifier_groups").delete().in("product_id", part);
    }
    if ((data.product_pairings ?? []).length > 0) {
      await admin.from("product_pairings").delete().in("product_id", part);
    }
  }
  await admin.from("products").delete().eq("restaurant_id", restaurantId);
  await admin.from("categories").delete().eq("restaurant_id", restaurantId);
}

/**
 * Yedeği geri yükler. Restoranın şu an kategorisi/ürünü varsa REDDEDER (üzerine yazmaz).
 * Orijinal id'ler korunur (bağlantılar ve basılı QR adresleri bozulmaz).
 */
export async function restoreMenuSnapshot(
  admin: SupabaseClient,
  snapshotId: string,
  expectedRestaurantId?: string
): Promise<RestoreSnapshotResult & { restaurantId?: string }> {
  const { data: snap, error: sErr } = await admin
    .from("menu_snapshots")
    .select("id, restaurant_id, data, expires_at")
    .eq("id", snapshotId)
    .maybeSingle();
  if (sErr) {
    console.error("[menu-snapshot] yedek okunamadı:", sErr);
    return { ok: false, status: 500, error: "Yedek okunamadı." };
  }
  if (!snap) return { ok: false, status: 404, error: "Yedek bulunamadı." };

  const row = snap as { restaurant_id: string; data: MenuSnapshotData; expires_at: string };
  if (expectedRestaurantId && row.restaurant_id !== expectedRestaurantId) {
    return { ok: false, status: 404, error: "Yedek bulunamadı." };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 404, error: "Yedeğin süresi dolmuş." };
  }
  const data = row.data;
  if (!data || data.version !== SNAPSHOT_VERSION || !Array.isArray(data.categories) || !Array.isArray(data.products)) {
    return { ok: false, status: 400, error: "Yedek biçimi tanınmıyor." };
  }
  const restaurantId = row.restaurant_id;

  const [{ count: catCount, error: cErr }, { count: prodCount, error: pErr }] = await Promise.all([
    admin.from("categories").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    admin.from("products").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
  ]);
  if (cErr || pErr) {
    console.error("[menu-snapshot] mevcut menü sayılamadı:", cErr ?? pErr);
    return { ok: false, status: 500, error: "Mevcut menü kontrol edilemedi." };
  }
  if ((catCount ?? 0) > 0 || (prodCount ?? 0) > 0) {
    return {
      ok: false,
      status: 409,
      error: "Restoranın şu an menüsü var. Geri yüklemek için önce menü boş olmalı.",
    };
  }

  const steps: Array<[string, Row[], "insert" | "upsert-ignore", string?]> = [
    // Üst kategoriler önce: parçalı yazımda alt kategori, üstünden önce eklenmesin (Faz 2.2).
    ["categories", parentsFirst(data.categories), "insert"],
    ["menu_collections", data.menu_collections ?? [], "upsert-ignore", "id"],
    ["category_menu_collections", data.category_menu_collections ?? [], "upsert-ignore", "category_id,menu_collection_id"],
    ["products", data.products, "insert"],
    ["product_variants", data.product_variants ?? [], "insert"],
    ["product_menu_collections", data.product_menu_collections ?? [], "upsert-ignore", "product_id,menu_collection_id"],
    // Faz 2.4: gruplar sıfırlamada silinmediği için çoğunlukla zaten vardır (varsa atlanır).
    ["modifier_groups", data.modifier_groups ?? [], "upsert-ignore", "id"],
    ["modifier_options", data.modifier_options ?? [], "upsert-ignore", "id"],
    ["product_modifier_groups", data.product_modifier_groups ?? [], "upsert-ignore", "product_id,group_id"],
    ["product_pairings", data.product_pairings ?? [], "upsert-ignore", "product_id,paired_product_id"],
  ];

  for (const [table, rows, mode, conflict] of steps) {
    const failure = await writeRows(admin, table, rows, mode, conflict);
    if (failure) {
      await rollbackRestore(admin, restaurantId, data);
      return { ok: false, status: 500, error: `${failure} Geri yükleme iptal edildi.` };
    }
  }

  return { ok: true, counts: countsOf(data), restaurantId };
}
