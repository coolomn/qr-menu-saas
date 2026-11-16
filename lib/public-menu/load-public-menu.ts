import { dropHiddenSubcategories } from "@/lib/public-menu/category-tree";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicProductVariant } from "@/lib/admin-menu/product-variants";
import { sortProductsByOrder } from "@/lib/admin-menu/product-sort";
import {
  attachMenuCollectionIds,
  buildCategoryMenuIdsMap,
  loadActiveMenuCollections,
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
import { parseSchedule, type Schedule } from "@/lib/public-menu/schedule";
import {
  attachProductExtras,
  loadProductExtras,
  parseRemovableIngredients,
  type ProductExtras,
  type PublicModifierGroup,
  type RemovableIngredient,
} from "@/lib/public-menu/product-extras";
import { isPublicMenuBlocked } from "@/lib/public-menu/subscription-gate";
import { normalizeLogoDisplayMode } from "@/lib/public-menu/logo-display";
import { normalizeFontStyleId } from "@/lib/public-menu/themes/font-normalize";
import type { FontStyleId } from "@/lib/public-menu/themes/font-ids";
import { normalizeThemeId } from "@/lib/public-menu/themes/normalize";
import type { ThemeId } from "@/lib/public-menu/themes/ids";
import { normalizeMenuLanguages, type MenuLanguage } from "@/lib/i18n/languages";
import { withCompactTranslations, type TranslationMap } from "@/lib/i18n/translations";
import { publicAnnouncement, type Announcement } from "@/lib/public-menu/announcement";
import {
  normalizeDisplayCurrencies,
  normalizeFixedRates,
  resolvePublicCurrencyRates,
  type ExchangeRateRow,
  type PublicCurrencyRate,
} from "@/lib/currency/currencies";

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
  wifi_name?: string | null;
  wifi_password?: string | null;
  whatsapp_number?: string | null;
  google_review_url?: string | null;
  opening_hours?: unknown;
  social_links?: unknown;
  show_price_date?: boolean | null;
  /** Faz 2.5: müşteri menüsü dilleri; yoksa varsayılan tr/en/ru. */
  menu_languages?: string[] | null;
  /** Faz 2.5c: "≈" ile gösterilecek dövizler + işletmenin sabit kuru; yoksa döviz gösterimi kapalı. */
  display_currencies?: string[] | null;
  fixed_exchange_rates?: unknown;
  /** Faz 2.9: üst duyuru şeridi (ham jsonb; {} = yok). */
  announcement?: unknown;
};

export type PublicRestaurantPayload = Omit<
  RestaurantRow,
  | "id"
  | "logo_display_mode"
  | "theme_id"
  | "font_style_id"
  | "menu_languages"
  | "display_currencies"
  | "fixed_exchange_rates"
  | "announcement"
> & {
  logo_display_mode: ReturnType<typeof normalizeLogoDisplayMode>;
  theme_id: ThemeId;
  font_style_id: FontStyleId;
  menu_languages: MenuLanguage[];
  /** Faz 2.5c: gösterilebilir kurlar (işletme sırası; eski/eksik kur atılmış). Boş = döviz gösterimi yok. */
  currency_rates?: PublicCurrencyRate[];
  /** Faz 2.9: yalnız AÇIK ve metni olan duyuru; tarih aralığı istemcide değerlendirilir. Yoksa alan yok. */
  announcement?: Announcement;
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
  /** Faz 2.2: alt kategoriyse üst kategorinin id'si. */
  parent_id?: string | null;
  note?: string | null;
  note_en?: string | null;
  note_ru?: string | null;
  /** Faz 2.3 zamanlaması; yok/null = her zaman. */
  schedule?: Schedule | null;
  /** Faz 2.5: en/ru dışı diller (en/ru eski kolonlarda; aynıysa burada tekrar edilmez). */
  translations?: TranslationMap;
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
  parent_id?: string | null;
  note?: string | null;
  note_en?: string | null;
  note_ru?: string | null;
  schedule?: Schedule | null;
  translations?: TranslationMap;
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
  is_sold_out?: boolean;
  badges?: string[];
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  price_updated_at?: string | null;
  schedule?: Schedule | null;
  /** Faz 2.4: boşsa alan yok. */
  removable_ingredients?: RemovableIngredient[];
  /** Faz 2.5 */
  translations?: TranslationMap;
};

export type PublicMenuBootstrapPayload = {
  restaurant: PublicRestaurantPayload;
  menu_collections: PublicMenuCollection[];
  menu_picker: PublicMenuPicker;
};

export type PublicMenuContentPayload = {
  categories: PublicCategoryPayload[];
  products: PublicProduct[];
  /** Faz 2.4: ürünlere bağlı seçenek grupları (ürünler modifier_group_ids ile işaret eder). */
  modifier_groups?: PublicModifierGroup[];
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

/** Faz 2.5c kolonları; migration uygulanmadıysa sorgu bunlarsız tekrarlanır. */
const RESTAURANT_CURRENCY_COLUMNS = ["display_currencies", "fixed_exchange_rates"].join(",");

/** Faz 2.9 kolonu; migration uygulanmadıysa sorgu bunsuz tekrarlanır. */
const RESTAURANT_ANNOUNCEMENT_COLUMN = "announcement";

/** Faz 2.1 kolonları; migration uygulanmadıysa sorgu bunlarsız tekrarlanır. */
const RESTAURANT_VENUE_COLUMNS = [
  "wifi_name",
  "wifi_password",
  "whatsapp_number",
  "google_review_url",
  "opening_hours",
  "social_links",
  "show_price_date",
].join(",");

const PRODUCT_BASICS_COLUMNS = [
  "is_sold_out",
  "badges",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "price_updated_at",
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

/** Faz 2.2 kolonları (alt kategori + kategori notu); migration yoksa bunlarsız tekrar denenir. */
const CATEGORY_STRUCTURE_COLUMNS = ["parent_id", "note", "note_en", "note_ru"].join(",");

/** Faz 2.3 kolonu (kategori + ürün); migration uygulanmadıysa sorgu bunsuz tekrarlanır. */
const SCHEDULE_COLUMN = "schedule";

/** Faz 2.4 kolonu; migration uygulanmadıysa sorgu bunsuz tekrarlanır. */
const REMOVABLE_INGREDIENTS_COLUMN = "removable_ingredients";

/** Faz 2.5 kolonu (kategori + ürün); migration uygulanmadıysa eski kademeli sorgulara düşülür. */
const TRANSLATIONS_COLUMN = "translations";
const CATEGORY_TRANSLATED_FIELDS = ["name", "main_group", "note"] as const;
const PRODUCT_TRANSLATED_FIELDS = ["name", "description"] as const;

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

/** DB'den gelen ham `schedule` değerini doğrulanmış biçime çevirir (geçersiz → null = her zaman). */
function withParsedSchedule<T extends { schedule?: unknown }>(row: T): T & { schedule: Schedule | null } {
  return { ...row, schedule: parseSchedule(row.schedule) };
}

function toCategoryRows(value: unknown): CategoryRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isCategoryRow)
    .map((row) => withCompactTranslations(withParsedSchedule(row), CATEGORY_TRANSLATED_FIELDS) as CategoryRow);
}

/** removable_ingredients'ı doğrular; boşsa alanı tamamen çıkarır (menü JSON'u küçük kalır). */
function withParsedIngredients<T extends { removable_ingredients?: unknown }>(
  row: T
): Omit<T, "removable_ingredients"> & { removable_ingredients?: RemovableIngredient[] } {
  const { removable_ingredients: raw, ...rest } = row;
  const list = parseRemovableIngredients(raw);
  return list.length > 0 ? { ...rest, removable_ingredients: list } : rest;
}

function toProductRows(value: unknown): ProductRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isProductRow)
    .map(
      (row) =>
        withCompactTranslations(
          withParsedIngredients(withParsedSchedule(row as ProductRow & { removable_ingredients?: unknown })),
          PRODUCT_TRANSLATED_FIELDS
        ) as ProductRow
    );
}

export function toPublicRestaurantPayload(
  restaurantRow: RestaurantRow,
  currencyRates: PublicCurrencyRate[] = []
): PublicRestaurantPayload {
  const {
    id: _restaurantId,
    tenant_status: _tenantStatus,
    subscription_ends_at: _subscriptionEndsAt,
    logo_display_mode: rawLogoDisplayMode,
    theme_id: rawThemeId,
    font_style_id: rawFontStyleId,
    menu_languages: rawMenuLanguages,
    display_currencies: _displayCurrencies,
    fixed_exchange_rates: _fixedExchangeRates,
    announcement: rawAnnouncement,
    ...publicRestaurant
  } = restaurantRow;
  const announcement = publicAnnouncement(rawAnnouncement);

  return {
    ...publicRestaurant,
    ...(announcement ? { announcement } : {}),
    logo_display_mode: normalizeLogoDisplayMode(rawLogoDisplayMode),
    theme_id: normalizeThemeId(rawThemeId),
    font_style_id: normalizeFontStyleId(rawFontStyleId),
    menu_languages: normalizeMenuLanguages(rawMenuLanguages),
    currency_rates: currencyRates,
  };
}

/**
 * Faz 2.5c: işletmenin açtığı dövizlerin gösterilebilir kurları. Döviz seçilmemişse sorgu yok.
 * Kur okunamazsa menü yine açılır (yalnız sabit kurlar gösterilir).
 */
export async function loadPublicCurrencyRates(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow,
  now: Date = new Date()
): Promise<PublicCurrencyRate[]> {
  const displayCurrencies = normalizeDisplayCurrencies(restaurantRow.display_currencies);
  if (displayCurrencies.length === 0) return [];
  const fixedRates = normalizeFixedRates(restaurantRow.fixed_exchange_rates);
  const needLive = displayCurrencies.filter((code) => fixedRates[code] === undefined);

  let liveRates: ExchangeRateRow[] = [];
  if (needLive.length > 0) {
    const { data, error } = await supabase
      .from("exchange_rates")
      .select("currency,try_per_unit,rate_date,fetched_at")
      .in("currency", needLive);
    if (error) {
      console.error("[public-menu] exchange_rates", error.message);
    } else {
      liveRates = (data ?? []) as ExchangeRateRow[];
    }
  }
  return resolvePublicCurrencyRates({ displayCurrencies, fixedRates, liveRates, now });
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
    .select(
      [
        RESTAURANT_COLUMNS,
        RESTAURANT_VENUE_COLUMNS,
        "menu_languages",
        RESTAURANT_CURRENCY_COLUMNS,
        RESTAURANT_ANNOUNCEMENT_COLUMN,
      ].join(",")
    )
    .eq("slug", normalizedSlug)
    .maybeSingle();

  // Faz 2.9 kolonu yoksa (migration uygulanmadı) bir önceki tam sorgu.
  if (restaurantError && isMissingColumn(restaurantError)) {
    ({ data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select([RESTAURANT_COLUMNS, RESTAURANT_VENUE_COLUMNS, "menu_languages", RESTAURANT_CURRENCY_COLUMNS].join(","))
      .eq("slug", normalizedSlug)
      .maybeSingle());
  }

  // Faz 2.5c kolonları yoksa (migration uygulanmadı) bir önceki tam sorgu.
  if (restaurantError && isMissingColumn(restaurantError)) {
    ({ data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select([RESTAURANT_COLUMNS, RESTAURANT_VENUE_COLUMNS, "menu_languages"].join(","))
      .eq("slug", normalizedSlug)
      .maybeSingle());
  }

  // Faz 2.5 kolonu yoksa (migration uygulanmadı) bir önceki tam sorgu.
  if (restaurantError && isMissingColumn(restaurantError)) {
    ({ data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select([RESTAURANT_COLUMNS, RESTAURANT_VENUE_COLUMNS].join(","))
      .eq("slug", normalizedSlug)
      .maybeSingle());
  }

  if (restaurantError && isMissingColumn(restaurantError)) {
    ({ data: restaurant, error: restaurantError } = await supabase
      .from("restaurants")
      .select(RESTAURANT_COLUMNS)
      .eq("slug", normalizedSlug)
      .maybeSingle());
  }

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
  const [menuData, currencyRates] = await Promise.all([
    loadActiveMenuCollections(supabase, restaurantRow.id),
    loadPublicCurrencyRates(supabase, restaurantRow),
  ]);

  return {
    restaurant: toPublicRestaurantPayload(restaurantRow, currencyRates),
    menu_collections: menuData.menu_collections,
    menu_picker: menuData.menu_picker,
  };
}

async function loadCategoryRows(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<CategoryRow[]> {
  let { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select([CATEGORY_COLUMNS, CATEGORY_STRUCTURE_COLUMNS, SCHEDULE_COLUMN, TRANSLATIONS_COLUMN].join(","))
    .eq("restaurant_id", restaurantId)
    .neq("is_active", false)
    .order("sort_order");

  // Faz 2.5 kolonu yoksa bir önceki tam sorgu.
  if (categoriesError && isMissingColumn(categoriesError)) {
    ({ data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select([CATEGORY_COLUMNS, CATEGORY_STRUCTURE_COLUMNS, SCHEDULE_COLUMN].join(","))
      .eq("restaurant_id", restaurantId)
      .neq("is_active", false)
      .order("sort_order"));
  }

  // Kademeli geri düşüş: önce yalnız zamanlama (2.3), sonra alt kategori (2.2) kolonları olmadan dene.
  if (categoriesError && isMissingColumn(categoriesError)) {
    ({ data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select([CATEGORY_COLUMNS, CATEGORY_STRUCTURE_COLUMNS].join(","))
      .eq("restaurant_id", restaurantId)
      .neq("is_active", false)
      .order("sort_order"));
  }

  if (categoriesError && isMissingColumn(categoriesError)) {
    ({ data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("restaurant_id", restaurantId)
      .neq("is_active", false)
      .order("sort_order"));
  }

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

  return dropHiddenSubcategories(toCategoryRows(categories));
}

async function loadProductRows(
  supabase: SupabaseClient,
  categoryIds: string[]
): Promise<ProductRow[]> {
  if (categoryIds.length === 0) return [];

  let { data: productRows, error: productsError } = await supabase
    .from("products")
    .select(
      [PRODUCT_COLUMNS, PRODUCT_BASICS_COLUMNS, SCHEDULE_COLUMN, REMOVABLE_INGREDIENTS_COLUMN, TRANSLATIONS_COLUMN].join(",")
    )
    .in("category_id", categoryIds)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  // Faz 2.5 kolonu yoksa bir önceki tam sorgu.
  if (productsError && isMissingColumn(productsError)) {
    ({ data: productRows, error: productsError } = await supabase
      .from("products")
      .select([PRODUCT_COLUMNS, PRODUCT_BASICS_COLUMNS, SCHEDULE_COLUMN, REMOVABLE_INGREDIENTS_COLUMN].join(","))
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }));
  }

  if (productsError && isMissingColumn(productsError)) {
    ({ data: productRows, error: productsError } = await supabase
      .from("products")
      .select([PRODUCT_COLUMNS, PRODUCT_BASICS_COLUMNS, SCHEDULE_COLUMN].join(","))
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }));
  }

  if (productsError && isMissingColumn(productsError)) {
    ({ data: productRows, error: productsError } = await supabase
      .from("products")
      .select([PRODUCT_COLUMNS, PRODUCT_BASICS_COLUMNS].join(","))
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }));
  }

  if (productsError && isMissingColumn(productsError)) {
    ({ data: productRows, error: productsError } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }));
  }

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

type PublicMenuCatalogPayload = PublicMenuContentPayload & {
  menu_collections: PublicMenuCollection[];
  menu_picker: PublicMenuPicker;
};

export function assemblePublicMenuCatalog(args: {
  categoryRows: CategoryRow[];
  menuData: {
    menu_collections: PublicMenuCollection[];
    menu_picker: PublicMenuPicker;
  };
  products: ProductRow[];
  menuIdsByCategory: Map<string, string[]>;
  productJunctionMaps: {
    menuIdsByProduct: Map<string, string[]>;
    productsWithJunction: Set<string>;
  };
  variantsByProduct: Map<string, PublicProductVariant[]>;
  /** Faz 2.4; verilmezse ürünlere ek alan eklenmez. */
  extras?: ProductExtras;
}): PublicMenuCatalogPayload {
  const publicCategories = attachMenuCollectionIds(args.categoryRows, args.menuIdsByCategory);

  const productsWithMenus = attachProductMenuCollectionIds(
    args.products,
    args.productJunctionMaps.menuIdsByProduct,
    args.productJunctionMaps.productsWithJunction,
    args.menuIdsByCategory,
    args.menuData.menu_picker.default_menu_collection_id
  );

  const withVariants = attachProductVariants(productsWithMenus, args.variantsByProduct);
  const publicProducts = args.extras
    ? attachProductExtras(withVariants, args.extras, new Set(withVariants.map((p) => p.id)))
    : withVariants;

  return {
    categories: publicCategories,
    products: publicProducts,
    ...(args.extras && args.extras.groups.length > 0 ? { modifier_groups: args.extras.groups } : {}),
    menu_collections: args.menuData.menu_collections,
    menu_picker: args.menuData.menu_picker,
  };
}

/**
 * Full catalog loader with three parallel query groups:
 * 1) categories + menu_collections
 * 2) products + category_menu_collections
 * 3) product_menu_collections + product_variants
 */
async function loadPublicMenuCatalog(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow
): Promise<PublicMenuCatalogPayload> {
  const restaurantId = restaurantRow.id;

  const [categoryRows, menuData] = await Promise.all([
    loadCategoryRows(supabase, restaurantId),
    loadActiveMenuCollections(supabase, restaurantId),
  ]);

  const categoryIds = categoryRows.map((category) => category.id);

  const [products, menuIdsByCategory] = await Promise.all([
    loadProductRows(supabase, categoryIds),
    buildCategoryMenuIdsMap(
      supabase,
      categoryIds,
      menuData.activeMenuIdSet,
      menuData.defaultMenuCollectionId
    ),
  ]);

  const productIds = products.map((product) => product.id);

  const [productJunctionMaps, variantsByProduct, extras] = await Promise.all([
    buildProductMenuCollectionsMaps(supabase, productIds, menuData.activeMenuIdSet),
    buildActivePublicVariantsMap(supabase, productIds),
    loadProductExtras(supabase, restaurantId, productIds),
  ]);

  return assemblePublicMenuCatalog({
    categoryRows,
    menuData,
    products,
    menuIdsByCategory,
    productJunctionMaps,
    variantsByProduct,
    extras,
  });
}

/** Tam menü katalogu: categories + products + junctions + variants. */
export async function buildPublicMenuContent(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow
): Promise<PublicMenuContentPayload> {
  const catalog = await loadPublicMenuCatalog(supabase, restaurantRow);
  return {
    categories: catalog.categories,
    products: catalog.products,
    ...(catalog.modifier_groups ? { modifier_groups: catalog.modifier_groups } : {}),
  };
}

export async function buildPublicMenuFull(
  supabase: SupabaseClient,
  restaurantRow: RestaurantRow
): Promise<PublicMenuFullPayload> {
  const [catalog, currencyRates] = await Promise.all([
    loadPublicMenuCatalog(supabase, restaurantRow),
    loadPublicCurrencyRates(supabase, restaurantRow),
  ]);
  return {
    restaurant: toPublicRestaurantPayload(restaurantRow, currencyRates),
    menu_collections: catalog.menu_collections,
    menu_picker: catalog.menu_picker,
    categories: catalog.categories,
    products: catalog.products,
    ...(catalog.modifier_groups ? { modifier_groups: catalog.modifier_groups } : {}),
  };
}

export function estimateJsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
