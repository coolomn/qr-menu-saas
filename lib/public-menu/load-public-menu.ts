import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicProductVariant } from "@/lib/admin-menu/product-variants";
import { sortProductsByOrder } from "@/lib/admin-menu/product-sort";
import {
  attachMenuCollectionIds,
  buildMenuCollectionsPayload,
  type PublicMenuCollection,
  type PublicMenuPicker,
} from "@/lib/public-menu/menu-collections";
import {
  attachProductMenuCollectionIds,
  buildProductMenuCollectionsMaps,
} from "@/lib/public-menu/product-menu-collections";
import {
  attachProductVariants,
  buildActivePublicVariantsMap,
  type PublicProduct,
} from "@/lib/public-menu/product-variants";
import { isPublicMenuBlocked } from "@/lib/public-menu/subscription-gate";
import { normalizeLogoDisplayMode } from "@/lib/public-menu/logo-display";
import { normalizeFontStyleId } from "@/lib/public-menu/themes/font-normalize";
import type { FontStyleId } from "@/lib/public-menu/themes/font-ids";
import { normalizeThemeId } from "@/lib/public-menu/themes/normalize";
import type { ThemeId } from "@/lib/public-menu/themes/ids";

export type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  slider_images: string[] | null;
  welcome_bg_url: string | null;
  instagram: string | null;
  logo_display_mode?: string | null;
  theme_id?: string | null;
  font_style_id?: string | null;
  tenant_status?: string | null;
  subscription_ends_at?: string | null;
};

export type PublicRestaurantPayload = Omit<
  RestaurantRow,
  "id" | "logo_display_mode" | "theme_id" | "font_style_id"
> & {
  logo_display_mode: ReturnType<typeof normalizeLogoDisplayMode>;
  theme_id: ThemeId;
  font_style_id: FontStyleId;
};

export type PublicCategoryPayload = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  main_group: string | null;
  main_group_en: string | null;
  main_group_ru: string | null;
  sort_order: number | null;
  menu_collection_ids: string[];
};

type CategoryRow = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  main_group: string | null;
  main_group_en: string | null;
  main_group_ru: string | null;
  sort_order: number | null;
};

type ProductRow = {
  id: string;
  category_id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  description: string | null;
  description_en: string | null;
  description_ru: string | null;
  price: string | null;
  image_url: string | null;
  thumbnail_url?: string | null;
  allergens: string[] | null;
  sort_order?: number | null;
  created_at?: string | null;
  variants?: PublicProductVariant[];
};

export type PublicMenuBootstrapPayload = {
  restaurant: PublicRestaurantPayload;
  menu_collections: PublicMenuCollection[];
  menu_picker: PublicMenuPicker;
};

export type PublicMenuContentPayload = {
  categories: PublicCategoryPayload[];
  products: PublicProduct[];
};

export type PublicMenuFullPayload = PublicMenuBootstrapPayload & PublicMenuContentPayload;

const RESTAURANT_COLUMNS_BASE = [
  "id",
  "slug",
  "name",
  "logo_url",
  "primary_color",
  "slider_images",
  "welcome_bg_url",
  "instagram",
].join(",");

const RESTAURANT_COLUMNS = [
  RESTAURANT_COLUMNS_BASE,
  "logo_display_mode",
  "theme_id",
  "font_style_id",
  "tenant_status",
  "subscription_ends_at",
].join(",");

const CATEGORY_COLUMNS = [
  "id",
  "name",
  "name_en",
  "name_ru",
  "main_group",
  "main_group_en",
  "main_group_ru",
  "sort_order",
].join(",");

const PRODUCT_COLUMNS_BASE = [
  "id",
  "category_id",
  "name",
  "name_en",
  "name_ru",
  "description",
  "description_en",
  "description_ru",
  "price",
  "image_url",
  "allergens",
].join(",");

const PRODUCT_COLUMNS = [
  PRODUCT_COLUMNS_BASE,
  "sort_order",
  "created_at",
  "thumbnail_url",
].join(",");

const PRODUCT_COLUMNS_WITHOUT_THUMBNAIL = [
  PRODUCT_COLUMNS_BASE,
  "sort_order",
  "created_at",
].join(",");

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || /column|schema cache|does not exist/i.test(error?.message || "");
}

export function isRestaurantRow(value: unknown): value is RestaurantRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.slug === "string" && typeof row.name === "string";
}

function isCategoryRow(value: unknown): value is CategoryRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string";
}

function isProductRow(value: unknown): value is ProductRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.category_id === "string" && typeof row.name === "string";
}

function toCategoryRows(value: unknown): CategoryRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCategoryRow);
}

function toProductRows(value: unknown): ProductRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isProductRow);
}

export function toPublicRestaurantPayload(restaurantRow: RestaurantRow): PublicRestaurantPayload {
  const {
    id: _restaurantId,
    tenant_status: _tenantStatus,
    subscription_ends_at: _subscriptionEndsAt,
    logo_display_mode: rawLogoDisplayMode,
    theme_id: rawThemeId,
    font_style_id: rawFontStyleId,
    ...publicRestaurant
  } = restaurantRow;

  return {
    ...publicRestaurant,
    logo_display_mode: normalizeLogoDisplayMode(rawLogoDisplayMode),
    theme_id: normalizeThemeId(rawThemeId),
    font_style_id: normalizeFontStyleId(rawFontStyleId),
  };
}

export type LoadRestaurantResult =
  | { ok: true; restaurant: RestaurantRow; gateColumnsAvailable: boolean }
  | { ok: false; kind: "not_found" | "invalid_shape" | "db_error"; error?: unknown };

export async function loadPublicMenuRestaurantBySlug(
  supabase: SupabaseClient,
  normalizedSlug: string
): Promise<LoadRestaurantResult> {
  let { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select(RESTAURANT_COLUMNS)
    .eq("slug", normalizedSlug)
    .maybeSingle();

  let gateColumnsAvailable = true;

  if (restaurantError && isMissingColumn(restaurantError)) {
    const retryWithFont = await supabase
      .from("restaurants")
      .select([RESTAURANT_COLUMNS_BASE, "logo_display_mode", "theme_id", "font_style_id"].join(","))
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (!retryWithFont.error) {
      restaurant = retryWithFont.data;
      restaurantError = null;
      gateColumnsAvailable = false;
    } else {
      const retryWithTheme = await supabase
        .from("restaurants")
        .select([RESTAURANT_COLUMNS_BASE, "logo_display_mode", "theme_id"].join(","))
        .eq("slug", normalizedSlug)
        .maybeSingle();

      if (!retryWithTheme.error) {
        restaurant = retryWithTheme.data;
        restaurantError = null;
        gateColumnsAvailable = false;
      } else {
        const retryWithLogoMode = await supabase
          .from("restaurants")
          .select([RESTAURANT_COLUMNS_BASE, "logo_display_mode"].join(","))
          .eq("slug", normalizedSlug)
          .maybeSingle();

        if (!retryWithLogoMode.error) {
          restaurant = retryWithLogoMode.data;
          restaurantError = null;
          gateColumnsAvailable = false;
        } else {
          gateColumnsAvailable = false;
          const fallback = await supabase
            .from("restaurants")
            .select(RESTAURANT_COLUMNS_BASE)
            .eq("slug", normalizedSlug)
            .maybeSingle();
          restaurant = fallback.data;
          restaurantError = fallback.error;
        }
      }
    }
  }

  if (restaurantError) {
    return { ok: false, kind: "db_error", error: restaurantError };
  }

  if (!restaurant) {
    return { ok: false, kind: "not_found" };
  }

  if (!isRestaurantRow(restaurant)) {
    return { ok: false, kind: "invalid_shape", error: restaurant };
  }

  return { ok: true, restaurant, gateColumnsAvailable };
}

export function isRestaurantAccessBlocked(
  restaurant: RestaurantRow,
  gateColumnsAvailable: boolean
): boolean {
  return (
    gateColumnsAvailable &&
    isPublicMenuBlocked({
      tenant_status: restaurant.tenant_status,
      subscription_ends_at: restaurant.subscription_ends_at,
    })
  );
}

/** İlk ekran: restaurant + menu collections (ürün/kategori yok). ~2 DB query. */
export async function buildPublicMenuBootstrap(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow
): Promise<PublicMenuBootstrapPayload> {
  const { menu_collections, menu_picker } = await buildMenuCollectionsPayload(
    supabase,
    restaurantRow.id,
    []
  );

  return {
    restaurant: toPublicRestaurantPayload(restaurantRow),
    menu_collections,
    menu_picker,
  };
}

async function loadCategoryRows(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<CategoryRow[]> {
  let { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .neq("is_active", false)
    .order("sort_order");

  if (categoriesError && isMissingColumn(categoriesError)) {
    const retry = await supabase
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    categories = retry.data;
    categoriesError = retry.error;
  }

  if (categoriesError) {
    throw categoriesError;
  }

  return toCategoryRows(categories);
}

async function loadProductRows(
  supabase: SupabaseClient,
  categoryIds: string[]
): Promise<ProductRow[]> {
  if (categoryIds.length === 0) return [];

  let { data: productRows, error: productsError } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .in("category_id", categoryIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (productsError && isMissingColumn(productsError)) {
    const retryWithSort = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS_WITHOUT_THUMBNAIL)
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    productRows = retryWithSort.data;
    productsError = retryWithSort.error;
  }

  if (productsError && isMissingColumn(productsError)) {
    const retry = await supabase
      .from("products")
      .select([PRODUCT_COLUMNS_BASE, "created_at"].join(","))
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    productRows = retry.data;
    productsError = retry.error;
  }

  if (productsError) {
    throw productsError;
  }

  return sortProductsByOrder(toProductRows(productRows));
}

/** Tam menü katalogu: categories + products + junctions + variants. */
export async function buildPublicMenuContent(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow
): Promise<PublicMenuContentPayload> {
  const categoryRows = await loadCategoryRows(supabase, restaurantRow.id);
  const categoryIds = categoryRows.map((category) => category.id);
  const products = await loadProductRows(supabase, categoryIds);

  const { menu_collections, menu_picker, menuIdsByCategory } =
    await buildMenuCollectionsPayload(supabase, restaurantRow.id, categoryIds);

  const publicCategories = attachMenuCollectionIds(categoryRows, menuIdsByCategory);

  const activeMenuIdSet = new Set(menu_collections.map((m) => m.id));
  const productIds = products.map((p) => p.id);
  const { menuIdsByProduct, productsWithJunction } = await buildProductMenuCollectionsMaps(
    supabase,
    productIds,
    activeMenuIdSet
  );

  const productsWithMenus = attachProductMenuCollectionIds(
    products,
    menuIdsByProduct,
    productsWithJunction,
    menuIdsByCategory,
    menu_picker.default_menu_collection_id
  );

  const variantsByProduct = await buildActivePublicVariantsMap(supabase, productIds);
  const publicProducts = attachProductVariants(productsWithMenus, variantsByProduct);

  return {
    categories: publicCategories,
    products: publicProducts,
  };
}

export async function buildPublicMenuFull(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow
): Promise<PublicMenuFullPayload> {
  const bootstrap = await buildPublicMenuBootstrap(supabase, restaurantRow);
  const content = await buildPublicMenuContent(supabase, restaurantRow);
  return {
    ...bootstrap,
    ...content,
  };
}

export function estimateJsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
