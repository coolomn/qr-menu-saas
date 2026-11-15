import type { SupabaseClient } from "@supabase/supabase-js";
import type { MenuCollectionCardVisualType } from "@/lib/admin-menu/types";
import { normalizeMenuCollectionCardVisualType } from "@/lib/admin-menu/types";
import { parseSchedule, type Schedule } from "@/lib/public-menu/schedule";

export type PublicMenuCollection = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  sort_order: number;
  card_visual_type: MenuCollectionCardVisualType;
  card_image_url: string | null;
  /** Faz 2.3 zamanlaması; yok/null = her zaman. */
  schedule?: Schedule | null;
};

export type PublicMenuPicker = {
  enabled: boolean;
  default_menu_collection_id: string | null;
};

type MenuCollectionRow = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  sort_order: number | null;
  card_visual_type?: string | null;
  card_image_url?: string | null;
  schedule?: unknown;
};

type JunctionRow = {
  category_id: string;
  menu_collection_id: string;
};

function isDbSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01") return true;
  const msg = error.message || "";
  return /column|relation|schema cache|does not exist/i.test(msg);
}

function toMenuCollectionRows(value: unknown): MenuCollectionRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is MenuCollectionRow => {
    if (typeof row !== "object" || row === null) return false;
    const r = row as Record<string, unknown>;
    return typeof r.id === "string" && typeof r.name === "string";
  });
}

function toJunctionRows(value: unknown): JunctionRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is JunctionRow => {
    if (typeof row !== "object" || row === null) return false;
    const r = row as Record<string, unknown>;
    return typeof r.category_id === "string" && typeof r.menu_collection_id === "string";
  });
}

function toPublicMenuCollection(row: MenuCollectionRow): PublicMenuCollection {
  return {
    id: row.id,
    name: row.name,
    name_en: row.name_en,
    name_ru: row.name_ru,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    card_visual_type: normalizeMenuCollectionCardVisualType(row.card_visual_type),
    card_image_url: row.card_image_url?.trim() || null,
    schedule: parseSchedule(row.schedule),
  };
}

export type MenuCollectionsPayload = {
  menu_collections: PublicMenuCollection[];
  menu_picker: PublicMenuPicker;
};

export type ActiveMenuCollectionsData = MenuCollectionsPayload & {
  activeMenuIdSet: Set<string>;
  defaultMenuCollectionId: string | null;
};

const MENU_COLLECTION_COLUMNS =
  "id, name, name_en, name_ru, description, start_time, end_time, sort_order, card_visual_type, card_image_url";

/** Faz 2.3 kolonu; migration uygulanmadıysa sorgu bunsuz tekrarlanır. */
const MENU_COLLECTION_COLUMNS_WITH_SCHEDULE = `${MENU_COLLECTION_COLUMNS}, schedule`;

/** Legacy select when new card visual columns are not migrated yet. */
const MENU_COLLECTION_COLUMNS_LEGACY =
  "id, name, name_en, name_ru, description, start_time, end_time, sort_order";

const EMPTY_MENU_COLLECTIONS: ActiveMenuCollectionsData = {
  menu_collections: [],
  menu_picker: { enabled: false, default_menu_collection_id: null },
  activeMenuIdSet: new Set(),
  defaultMenuCollectionId: null,
};

/** Loads active menu collections for a restaurant (no category junctions). */
export async function loadActiveMenuCollections(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<ActiveMenuCollectionsData> {
  let menuRows: unknown = null;
  // En yeni kolon setinden eskiye doğru dene; kolon yoksa (migration henüz uygulanmamış) bir önceki sete düş.
  const columnSets = [
    MENU_COLLECTION_COLUMNS_WITH_SCHEDULE,
    MENU_COLLECTION_COLUMNS,
    MENU_COLLECTION_COLUMNS_LEGACY,
  ];

  for (const columns of columnSets) {
    const result = await supabase
      .from("menu_collections")
      .select(columns)
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (!result.error) {
      menuRows = result.data;
      break;
    }
    if (isDbSchemaError(result.error)) {
      if (columns === MENU_COLLECTION_COLUMNS_LEGACY) {
        console.warn("menu_collections unavailable for public menu:", result.error.message);
        return EMPTY_MENU_COLLECTIONS;
      }
      continue;
    }
    console.error(result.error);
    return EMPTY_MENU_COLLECTIONS;
  }

  const activeMenus = toMenuCollectionRows(menuRows).map(toPublicMenuCollection);
  const activeMenuIdSet = new Set(activeMenus.map((m) => m.id));
  const defaultMenuCollectionId = activeMenus[0]?.id ?? null;

  return {
    menu_collections: activeMenus,
    menu_picker: {
      enabled: activeMenus.length >= 2,
      default_menu_collection_id: defaultMenuCollectionId,
    },
    activeMenuIdSet,
    defaultMenuCollectionId,
  };
}

/** Loads category ↔ menu junctions and applies default-menu fallback. */
export async function buildCategoryMenuIdsMap(
  supabase: SupabaseClient,
  categoryIds: string[],
  activeMenuIdSet: Set<string>,
  defaultMenuCollectionId: string | null
): Promise<Map<string, string[]>> {
  const menuIdsByCategory = new Map<string, string[]>();

  if (categoryIds.length > 0 && activeMenuIdSet.size > 0) {
    const { data: junctionRows, error: junctionError } = await supabase
      .from("category_menu_collections")
      .select("category_id, menu_collection_id")
      .in("category_id", categoryIds);

    if (junctionError) {
      if (isDbSchemaError(junctionError)) {
        console.warn("category_menu_collections unavailable for public menu:", junctionError.message);
      } else {
        console.error(junctionError);
      }
    } else {
      for (const link of toJunctionRows(junctionRows)) {
        if (!activeMenuIdSet.has(link.menu_collection_id)) continue;
        const list = menuIdsByCategory.get(link.category_id) ?? [];
        if (!list.includes(link.menu_collection_id)) {
          list.push(link.menu_collection_id);
        }
        menuIdsByCategory.set(link.category_id, list);
      }
    }
  }

  for (const categoryId of categoryIds) {
    let ids = menuIdsByCategory.get(categoryId) ?? [];
    if (ids.length === 0 && defaultMenuCollectionId) {
      ids = [defaultMenuCollectionId];
    }
    menuIdsByCategory.set(categoryId, ids);
  }

  return menuIdsByCategory;
}

/**
 * Loads active menu collections and category junctions for the public menu API.
 * On schema/read errors returns empty collections (legacy consumers unaffected).
 */
export async function buildMenuCollectionsPayload(
  supabase: SupabaseClient,
  restaurantId: string,
  categoryIds: string[]
): Promise<MenuCollectionsPayload & { menuIdsByCategory: Map<string, string[]> }> {
  const menuData = await loadActiveMenuCollections(supabase, restaurantId);
  const menuIdsByCategory = await buildCategoryMenuIdsMap(
    supabase,
    categoryIds,
    menuData.activeMenuIdSet,
    menuData.defaultMenuCollectionId
  );

  return {
    menu_collections: menuData.menu_collections,
    menu_picker: menuData.menu_picker,
    menuIdsByCategory,
  };
}

export function attachMenuCollectionIds<T extends { id: string }>(
  categories: T[],
  menuIdsByCategory: Map<string, string[]>
): (T & { menu_collection_ids: string[] })[] {
  return categories.map((cat) => ({
    ...cat,
    menu_collection_ids: menuIdsByCategory.get(cat.id) ?? [],
  }));
}
