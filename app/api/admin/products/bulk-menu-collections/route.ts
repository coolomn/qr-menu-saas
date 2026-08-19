import { NextResponse } from "next/server";
import {
  assertBulkTargetOwnership,
  findIncompatibleBulkAddTargets,
  formatBulkProductMenuResultMessage,
  formatIncompatibleBulkAddError,
  planBulkProductMenuCollectionChanges,
  uniqueIds,
} from "@/lib/admin-menu/bulk-product-menu-collections";
import {
  deleteProductMenuCollectionLinks,
  getOwnerRestaurant,
  insertProductMenuCollectionLinks,
  listMenuCollectionsForRestaurantPicker,
  mapDbErrorMessage,
  resolveAvailableMenuCollectionIds,
} from "@/lib/admin-menu/helpers";
import { bulkProductMenuCollectionsSchema } from "@/lib/admin-menu/validation";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const parsed = bulkProductMenuCollectionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Veri doğrulanamadı.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const productIds = uniqueIds(parsed.data.productIds);
    const menuCollectionIds = uniqueIds(parsed.data.menuCollectionIds);
    const { restaurantId, action } = parsed.data;

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const owner = await getOwnerRestaurant(admin, user.id, restaurantId);
    if ("error" in owner) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }

    const [{ data: productRows, error: productErr }, { data: menuRows, error: menuErr }] =
      await Promise.all([
        admin
          .from("products")
          .select("id, restaurant_id, category_id")
          .in("id", productIds),
        admin
          .from("menu_collections")
          .select("id, restaurant_id, is_active, name")
          .in("id", menuCollectionIds),
      ]);

    if (productErr) {
      console.error(productErr);
      return NextResponse.json({ error: "Ürünler okunamadı." }, { status: 500 });
    }
    if (menuErr) {
      console.error(menuErr);
      return NextResponse.json({ error: "Menüler okunamadı." }, { status: 500 });
    }

    const ownership = assertBulkTargetOwnership({
      restaurantId,
      requestedProductIds: productIds,
      products: productRows || [],
      requestedMenuIds: menuCollectionIds,
      menus: menuRows || [],
    });
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }

    const products = productRows || [];
    const categoryIds = uniqueIds(products.map((p) => p.category_id).filter(Boolean));
    const [activeMenus, { data: categoryLinks, error: categoryLinkErr }, { data: existingLinks, error: linkErr }] =
      await Promise.all([
        listMenuCollectionsForRestaurantPicker(admin, restaurantId, true),
        categoryIds.length > 0
          ? admin
              .from("category_menu_collections")
              .select("category_id, menu_collection_id")
              .in("category_id", categoryIds)
          : Promise.resolve({ data: [], error: null }),
        admin
          .from("product_menu_collections")
          .select("product_id, menu_collection_id")
          .in("product_id", productIds),
      ]);

    if (categoryLinkErr) {
      console.error(categoryLinkErr);
      return NextResponse.json({ error: "Kategori menü bağlantıları okunamadı." }, { status: 500 });
    }
    if (linkErr) {
      console.error(linkErr);
      return NextResponse.json({ error: "Ürün menü bağlantıları okunamadı." }, { status: 500 });
    }

    const categoryMenuIds = new Map<string, string[]>();
    for (const id of categoryIds) categoryMenuIds.set(id, []);
    for (const row of categoryLinks || []) {
      const list = categoryMenuIds.get(row.category_id as string) ?? [];
      list.push(row.menu_collection_id as string);
      categoryMenuIds.set(row.category_id as string, list);
    }

    const availableMenuIdsByCategory = new Map<string, string[]>();
    for (const categoryId of categoryIds) {
      availableMenuIdsByCategory.set(
        categoryId,
        resolveAvailableMenuCollectionIds(activeMenus, categoryMenuIds.get(categoryId) || [])
      );
    }

    if (action === "add") {
      const { data: categoryRows, error: categoryNameErr } =
        categoryIds.length > 0
          ? await admin.from("categories").select("id, name").in("id", categoryIds)
          : { data: [], error: null };
      if (categoryNameErr) {
        console.error(categoryNameErr);
        return NextResponse.json({ error: "Kategoriler okunamadı." }, { status: 500 });
      }

      const categoryNames: Record<string, string> = {};
      for (const row of categoryRows || []) {
        categoryNames[row.id as string] = (row.name as string) || "Kategori";
      }
      const menuNames: Record<string, string> = {};
      for (const row of menuRows || []) {
        menuNames[row.id as string] = ((row as { name?: string }).name as string) || "Menü";
      }

      const incompatibleCategories = findIncompatibleBulkAddTargets({
        products,
        menuCollectionIds,
        availableMenuIdsByCategory,
        categoryNames,
        menuNames,
      });
      if (incompatibleCategories.length > 0) {
        return NextResponse.json(
          {
            error: formatIncompatibleBulkAddError(incompatibleCategories),
            incompatibleCategories,
          },
          { status: 400 }
        );
      }
    }

    const plan = planBulkProductMenuCollectionChanges({
      action,
      productIds,
      menuCollectionIds,
      products,
      existingLinks: (existingLinks || []) as { product_id: string; menu_collection_id: string }[],
      availableMenuIdsByCategory,
    });

    if (action === "add") {
      await insertProductMenuCollectionLinks(admin, plan.toInsert);
    } else {
      await deleteProductMenuCollectionLinks(admin, productIds, menuCollectionIds);
    }

    return NextResponse.json({
      ok: true,
      action,
      productCount: productIds.length,
      linksAdded: plan.linksAdded,
      linksRemoved: action === "remove" ? plan.linksRemoved : 0,
      skippedUnavailable: plan.skippedUnavailable,
      linksByProduct: plan.linksByProduct,
      message: formatBulkProductMenuResultMessage({
        action,
        productCount: productIds.length,
        linksAdded: plan.linksAdded,
        linksRemoved: plan.linksRemoved,
      }),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: mapDbErrorMessage(e as { code?: string; message?: string }) },
      { status: 500 }
    );
  }
}
