import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminMenuCollection,
  AdminMenuCollectionListItem,
  CategoryMenuCollectionsPickerMenu,
} from "@/lib/admin-menu/types";

type DbMenuRow = {
  id: string;
  restaurant_id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at?: string;
  updated_at?: string;
};

export function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint|menu_collections_restaurant_name_unique/i.test(
    error.message || ""
  );
}

export function mapDbErrorMessage(error: { code?: string; message?: string } | null): string {
  if (!error) return "İşlem başarısız.";
  if (isUniqueViolation(error)) {
    return "Bu restoranda aynı isimde bir menü zaten var.";
  }
  return error.message || "İşlem başarısız.";
}

export async function getOwnerRestaurant(
  admin: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<{ restaurant: { id: string } } | { error: string; status: number }> {
  const { data, error } = await admin
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { error: "Restoran doğrulanamadı.", status: 500 };
  }
  if (!data) {
    return { error: "Restoran bulunamadı veya yetkiniz yok.", status: 403 };
  }
  return { restaurant: data };
}

export async function getCategoryCountsByMenuCollection(
  admin: SupabaseClient,
  restaurantId: string,
  menuCollectionIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const id of menuCollectionIds) counts.set(id, 0);
  if (menuCollectionIds.length === 0) return counts;

  const { data: categories, error: catErr } = await admin
    .from("categories")
    .select("id")
    .eq("restaurant_id", restaurantId);

  if (catErr || !categories?.length) return counts;

  const categoryIds = categories.map((c) => c.id);
  const { data: links, error: linkErr } = await admin
    .from("category_menu_collections")
    .select("category_id, menu_collection_id")
    .in("category_id", categoryIds)
    .in("menu_collection_id", menuCollectionIds);

  if (linkErr) {
    console.error(linkErr);
    return counts;
  }

  for (const link of links || []) {
    const prev = counts.get(link.menu_collection_id) ?? 0;
    counts.set(link.menu_collection_id, prev + 1);
  }
  return counts;
}

export function toListItem(
  row: DbMenuRow,
  categoryCount: number
): AdminMenuCollectionListItem {
  return {
    id: row.id,
    name: row.name,
    name_en: row.name_en,
    name_ru: row.name_ru,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    is_active: row.is_active,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category_count: categoryCount,
  };
}

export async function listMenuCollectionsForRestaurant(
  admin: SupabaseClient,
  restaurantId: string
): Promise<AdminMenuCollectionListItem[]> {
  const { data: rows, error } = await admin
    .from("menu_collections")
    .select(
      "id, restaurant_id, name, name_en, name_ru, description, start_time, end_time, is_active, sort_order, created_at, updated_at"
    )
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  const menus = (rows || []) as DbMenuRow[];
  const counts = await getCategoryCountsByMenuCollection(
    admin,
    restaurantId,
    menus.map((m) => m.id)
  );
  return menus.map((row) => toListItem(row, counts.get(row.id) ?? 0));
}

export async function getNextMenuCollectionSortOrder(
  admin: SupabaseClient,
  restaurantId: string
): Promise<number> {
  const { data } = await admin
    .from("menu_collections")
    .select("sort_order")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (typeof data?.sort_order === "number") return data.sort_order + 1;
  return 0;
}

export async function getMenuCollectionJunctionCounts(
  admin: SupabaseClient,
  menuCollectionId: string
): Promise<{ category_links: number; product_links: number }> {
  const { count: categoryLinks, error: catErr } = await admin
    .from("category_menu_collections")
    .select("*", { count: "exact", head: true })
    .eq("menu_collection_id", menuCollectionId);

  if (catErr) {
    console.error(catErr);
  }

  const { count: productLinks, error: prodErr } = await admin
    .from("product_menu_collections")
    .select("*", { count: "exact", head: true })
    .eq("menu_collection_id", menuCollectionId);

  if (prodErr) {
    console.error(prodErr);
  }

  return {
    category_links: categoryLinks ?? 0,
    product_links: productLinks ?? 0,
  };
}

export async function assertCanDeleteMenuCollection(
  admin: SupabaseClient,
  restaurantId: string,
  menuCollectionId: string,
  options: { isActive: boolean }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: menus, error } = await admin
    .from("menu_collections")
    .select("id, is_active")
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error(error);
    return { ok: false, message: "Menü durumu kontrol edilemedi." };
  }

  const all = menus || [];
  if (all.length <= 1) {
    return { ok: false, message: "Son menü silinemez. En az bir menü kalmalıdır." };
  }

  if (options.isActive) {
    const activeOthers = all.filter((m) => m.is_active && m.id !== menuCollectionId);
    if (activeOthers.length === 0) {
      return { ok: false, message: "En az bir aktif menü kalmalıdır." };
    }
  }

  return { ok: true };
}

export async function assertCanDeactivateMenuCollection(
  admin: SupabaseClient,
  restaurantId: string,
  menuCollectionId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: menus, error } = await admin
    .from("menu_collections")
    .select("id, is_active")
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error(error);
    return { ok: false, message: "Menü durumu kontrol edilemedi." };
  }

  const activeOthers = (menus || []).filter((m) => m.is_active && m.id !== menuCollectionId);
  if (activeOthers.length === 0) {
    return { ok: false, message: "En az bir aktif menü kalmalıdır." };
  }
  return { ok: true };
}

export async function getMenuCollectionForOwner(
  admin: SupabaseClient,
  userId: string,
  menuCollectionId: string
): Promise<
  | { row: DbMenuRow; restaurantId: string }
  | { error: string; status: number }
> {
  const { data: row, error } = await admin
    .from("menu_collections")
    .select(
      "id, restaurant_id, name, name_en, name_ru, description, start_time, end_time, is_active, sort_order, created_at, updated_at"
    )
    .eq("id", menuCollectionId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { error: "Menü okunamadı.", status: 500 };
  }
  if (!row) {
    return { error: "Menü bulunamadı.", status: 404 };
  }

  const ownerCheck = await getOwnerRestaurant(admin, userId, row.restaurant_id);
  if ("error" in ownerCheck) {
    return { error: ownerCheck.error, status: ownerCheck.status };
  }

  return { row: row as DbMenuRow, restaurantId: row.restaurant_id };
}

type DbCategoryRow = {
  id: string;
  restaurant_id: string;
};

export async function getCategoryForOwner(
  admin: SupabaseClient,
  userId: string,
  categoryId: string
): Promise<{ category: DbCategoryRow } | { error: string; status: number }> {
  const { data: category, error } = await admin
    .from("categories")
    .select("id, restaurant_id")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { error: "Kategori okunamadı.", status: 500 };
  }
  if (!category) {
    return { error: "Kategori bulunamadı.", status: 404 };
  }

  const ownerCheck = await getOwnerRestaurant(admin, userId, category.restaurant_id);
  if ("error" in ownerCheck) {
    return { error: ownerCheck.error, status: ownerCheck.status };
  }

  return { category: category as DbCategoryRow };
}

export async function listMenuCollectionsForRestaurantPicker(
  admin: SupabaseClient,
  restaurantId: string,
  activeOnly: boolean
) {
  let query = admin
    .from("menu_collections")
    .select("id, name, name_en, name_ru, sort_order, is_active")
    .eq("restaurant_id", restaurantId)
    .order("sort_order", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    name_en: row.name_en as string | null,
    name_ru: row.name_ru as string | null,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    is_active: Boolean(row.is_active),
  }));
}

export async function getCategoryMenuCollectionIds(
  admin: SupabaseClient,
  categoryId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("category_menu_collections")
    .select("menu_collection_id")
    .eq("category_id", categoryId);

  if (error) throw error;
  return (data || []).map((row) => row.menu_collection_id as string);
}

export async function validateMenuCollectionIdsForRestaurant(
  admin: SupabaseClient,
  restaurantId: string,
  menuCollectionIds: string[],
  options?: { activeOnly?: boolean }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const activeOnly = options?.activeOnly !== false;
  const menus = await listMenuCollectionsForRestaurantPicker(admin, restaurantId, false);
  const allowed = new Set(
    menus.filter((m) => (activeOnly ? m.is_active : true)).map((m) => m.id)
  );

  if (allowed.size === 0) {
    return { ok: false, message: "Aktif menü bulunamadı. Önce bir menü oluşturun." };
  }

  const unique = [...new Set(menuCollectionIds)];
  if (unique.length !== menuCollectionIds.length) {
    return { ok: false, message: "Yinelenen menü seçimi." };
  }

  for (const id of unique) {
    if (!allowed.has(id)) {
      return { ok: false, message: "Seçilen menülerden biri geçersiz veya pasif." };
    }
  }

  return { ok: true };
}

export async function ensureCategoryMenuCollectionLink(
  admin: SupabaseClient,
  categoryId: string,
  menuCollectionId: string
): Promise<void> {
  const { data: existing, error: readErr } = await admin
    .from("category_menu_collections")
    .select("category_id")
    .eq("category_id", categoryId)
    .eq("menu_collection_id", menuCollectionId)
    .maybeSingle();

  if (readErr) throw readErr;
  if (existing) return;

  const { error: insertErr } = await admin.from("category_menu_collections").insert({
    category_id: categoryId,
    menu_collection_id: menuCollectionId,
  });

  if (insertErr) throw insertErr;
}

function isProductMenuCollectionsSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "42703") return true;
  const msg = error.message || "";
  return /product_menu_collections|relation|schema cache|does not exist/i.test(msg);
}

export type EnsureProductMenuCollectionLinkResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; error: string };

/**
 * Idempotent link: inserts only if missing. Skips gracefully when junction table is unavailable.
 */
export async function ensureProductMenuCollectionLink(
  admin: SupabaseClient,
  productId: string,
  menuCollectionId: string
): Promise<EnsureProductMenuCollectionLinkResult> {
  const { data: existing, error: readErr } = await admin
    .from("product_menu_collections")
    .select("product_id")
    .eq("product_id", productId)
    .eq("menu_collection_id", menuCollectionId)
    .maybeSingle();

  if (readErr) {
    if (isProductMenuCollectionsSchemaError(readErr)) {
      console.warn("product_menu_collections unavailable:", readErr.message);
      return { ok: false, skipped: true };
    }
    console.error(readErr);
    return { ok: false, error: "Ürün menü bağlantısı okunamadı." };
  }

  if (existing) {
    return { ok: true };
  }

  const { error: insertErr } = await admin.from("product_menu_collections").insert({
    product_id: productId,
    menu_collection_id: menuCollectionId,
  });

  if (!insertErr) {
    return { ok: true };
  }

  if (insertErr.code === "23505") {
    return { ok: true };
  }

  if (isProductMenuCollectionsSchemaError(insertErr)) {
    console.warn("product_menu_collections unavailable:", insertErr.message);
    return { ok: false, skipped: true };
  }

  console.error(insertErr);
  return { ok: false, error: insertErr.message || "Ürün menüye bağlanamadı." };
}

export async function replaceCategoryMenuCollections(
  admin: SupabaseClient,
  categoryId: string,
  menuCollectionIds: string[]
): Promise<void> {
  const { error: deleteErr } = await admin
    .from("category_menu_collections")
    .delete()
    .eq("category_id", categoryId);

  if (deleteErr) throw deleteErr;

  if (menuCollectionIds.length === 0) return;

  const { error: insertErr } = await admin.from("category_menu_collections").insert(
    menuCollectionIds.map((menu_collection_id) => ({
      category_id: categoryId,
      menu_collection_id,
    }))
  );

  if (insertErr) throw insertErr;
}

type DbProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
};

export async function getProductForOwner(
  admin: SupabaseClient,
  userId: string,
  productId: string
): Promise<{ product: DbProductRow } | { error: string; status: number }> {
  const { data: product, error } = await admin
    .from("products")
    .select("id, restaurant_id, category_id")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return { error: "Ürün okunamadı.", status: 500 };
  }
  if (!product) {
    return { error: "Ürün bulunamadı.", status: 404 };
  }

  const ownerCheck = await getOwnerRestaurant(admin, userId, product.restaurant_id);
  if ("error" in ownerCheck) {
    return { error: ownerCheck.error, status: ownerCheck.status };
  }

  return { product: product as DbProductRow };
}

export async function getProductMenuCollectionIds(
  admin: SupabaseClient,
  productId: string
): Promise<string[]> {
  const { data, error } = await admin
    .from("product_menu_collections")
    .select("menu_collection_id")
    .eq("product_id", productId);

  if (error) throw error;
  return (data || []).map((row) => row.menu_collection_id as string);
}

export async function getAvailableMenuCollectionsForCategory(
  admin: SupabaseClient,
  restaurantId: string,
  categoryId: string
): Promise<CategoryMenuCollectionsPickerMenu[]> {
  const activeMenus = await listMenuCollectionsForRestaurantPicker(admin, restaurantId, true);
  const categoryMenuIds = await getCategoryMenuCollectionIds(admin, categoryId);
  const activeIdSet = new Set(activeMenus.map((m) => m.id));
  let allowedIds = categoryMenuIds.filter((id) => activeIdSet.has(id));

  if (allowedIds.length === 0 && activeMenus.length > 0) {
    allowedIds = [activeMenus[0].id];
  }

  const allowedSet = new Set(allowedIds);
  return activeMenus.filter((m) => allowedSet.has(m.id));
}

export async function validateProductMenuCollectionIdsForCategory(
  admin: SupabaseClient,
  restaurantId: string,
  categoryId: string,
  menuCollectionIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const restaurantValidation = await validateMenuCollectionIdsForRestaurant(
    admin,
    restaurantId,
    menuCollectionIds,
    { activeOnly: true }
  );
  if (!restaurantValidation.ok) {
    return restaurantValidation;
  }

  const available = await getAvailableMenuCollectionsForCategory(admin, restaurantId, categoryId);
  const allowed = new Set(available.map((m) => m.id));

  for (const id of menuCollectionIds) {
    if (!allowed.has(id)) {
      return {
        ok: false,
        message: "Seçilen menüler bu kategorinin bağlı olduğu menüler arasında değil.",
      };
    }
  }

  return { ok: true };
}

export async function replaceProductMenuCollections(
  admin: SupabaseClient,
  productId: string,
  menuCollectionIds: string[]
): Promise<void> {
  const { error: deleteErr } = await admin
    .from("product_menu_collections")
    .delete()
    .eq("product_id", productId);

  if (deleteErr) throw deleteErr;

  if (menuCollectionIds.length === 0) return;

  const { error: insertErr } = await admin.from("product_menu_collections").insert(
    menuCollectionIds.map((menu_collection_id) => ({
      product_id: productId,
      menu_collection_id,
    }))
  );

  if (insertErr) throw insertErr;
}

export function toAdminMenuCollection(row: DbMenuRow): AdminMenuCollection {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    name: row.name,
    name_en: row.name_en,
    name_ru: row.name_ru,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    is_active: row.is_active,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
