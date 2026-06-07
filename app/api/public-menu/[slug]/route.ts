import { NextResponse } from "next/server";
import {
  isPublicMenuBlocked,
  PUBLIC_MENU_UNAVAILABLE_MESSAGE,
} from "@/lib/public-menu/subscription-gate";
import {
  attachMenuCollectionIds,
  buildMenuCollectionsPayload,
} from "@/lib/public-menu/menu-collections";
import {
  attachProductMenuCollectionIds,
  buildProductMenuCollectionsMaps,
} from "@/lib/public-menu/product-menu-collections";
import {
  attachProductVariants,
  buildActivePublicVariantsMap,
} from "@/lib/public-menu/product-variants";
import type { PublicProductVariant } from "@/lib/admin-menu/product-variants";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { sortProductsByOrder } from "@/lib/admin-menu/product-sort";
import { normalizeLogoDisplayMode } from "@/lib/public-menu/logo-display";

export const runtime = "nodejs";

type RestaurantRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  slider_images: string[] | null;
  welcome_bg_url: string | null;
  instagram: string | null;
  logo_display_mode?: string | null;
  tenant_status?: string | null;
  subscription_ends_at?: string | null;
};

type PublicRestaurant = Omit<RestaurantRow, "id" | "logo_display_mode"> & {
  logo_display_mode: ReturnType<typeof normalizeLogoDisplayMode>;
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
  allergens: string[] | null;
  sort_order?: number | null;
  created_at?: string | null;
  variants?: PublicProductVariant[];
};

function isRestaurantRow(value: unknown): value is RestaurantRow {
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
].join(",");

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" || /column|schema cache|does not exist/i.test(error?.message || "");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    return NextResponse.json({ error: "Slug zorunlu." }, { status: 400 });
  }

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return NextResponse.json({ error: svc.error }, { status: 503 });
  }
  const supabase = svc.client;

  let { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .select(RESTAURANT_COLUMNS)
    .eq("slug", normalizedSlug)
    .maybeSingle();

  let gateColumnsAvailable = true;

  if (restaurantError && isMissingColumn(restaurantError)) {
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

  if (restaurantError) {
    console.error(restaurantError);
    return NextResponse.json({ error: "Menü okunamadı." }, { status: 500 });
  }

  if (!restaurant) {
    return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
  }

  if (!isRestaurantRow(restaurant)) {
    console.error("Unexpected restaurant row shape", restaurant);
    return NextResponse.json({ error: "Menü okunamadı." }, { status: 500 });
  }

  const restaurantRow: RestaurantRow = restaurant;

  if (
    gateColumnsAvailable &&
    isPublicMenuBlocked({
      tenant_status: restaurantRow.tenant_status,
      subscription_ends_at: restaurantRow.subscription_ends_at,
    })
  ) {
    return NextResponse.json(
      { error: PUBLIC_MENU_UNAVAILABLE_MESSAGE },
      { status: 403 }
    );
  }

  let categoriesQuery = supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("restaurant_id", restaurantRow.id)
    .neq("is_active", false)
    .order("sort_order");

  let { data: categories, error: categoriesError } = await categoriesQuery;
  if (categoriesError && isMissingColumn(categoriesError)) {
    const retry = await supabase
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .eq("restaurant_id", restaurantRow.id)
      .order("sort_order");
    categories = retry.data;
    categoriesError = retry.error;
  }

  if (categoriesError) {
    console.error(categoriesError);
    return NextResponse.json({ error: "Kategoriler okunamadı." }, { status: 500 });
  }

  const categoryRows = toCategoryRows(categories);
  const categoryIds = categoryRows.map((category) => category.id);
  let products: ProductRow[] = [];

  if (categoryIds.length > 0) {
    let { data: productRows, error: productsError } = await supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .in("category_id", categoryIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

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
      console.error(productsError);
      return NextResponse.json({ error: "Ürünler okunamadı." }, { status: 500 });
    }

    products = sortProductsByOrder(toProductRows(productRows));
  }

  const {
    id: _restaurantId,
    tenant_status: _tenantStatus,
    subscription_ends_at: _subscriptionEndsAt,
    logo_display_mode: rawLogoDisplayMode,
    ...publicRestaurant
  } = restaurantRow;

  const restaurantPayload: PublicRestaurant = {
    ...publicRestaurant,
    logo_display_mode: normalizeLogoDisplayMode(rawLogoDisplayMode),
  };

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

  return NextResponse.json({
    restaurant: restaurantPayload,
    menu_collections,
    menu_picker,
    categories: publicCategories,
    products: publicProducts,
  });
}
