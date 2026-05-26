import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminMenuCollection, AdminMenuCollectionListItem } from "@/lib/admin-menu/types";

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
