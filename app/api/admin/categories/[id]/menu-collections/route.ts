import { NextResponse } from "next/server";
import {
  getCategoryForOwner,
  getCategoryMenuCollectionIds,
  listMenuCollectionsForRestaurantPicker,
  mapDbErrorMessage,
  replaceCategoryMenuCollections,
  validateMenuCollectionIdsForRestaurant,
} from "@/lib/admin-menu/helpers";
import { putCategoryMenuCollectionsSchema } from "@/lib/admin-menu/validation";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, error: authErr } = await getUserFromBearer(_request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    const { id: categoryId } = await context.params;
    if (!categoryId?.trim()) {
      return NextResponse.json({ error: "Kategori kimliği zorunlu." }, { status: 400 });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const categoryResult = await getCategoryForOwner(admin, user.id, categoryId);
    if ("error" in categoryResult) {
      return NextResponse.json({ error: categoryResult.error }, { status: categoryResult.status });
    }

    const restaurantId = categoryResult.category.restaurant_id;
    const [menu_collections, linkedIds] = await Promise.all([
      listMenuCollectionsForRestaurantPicker(admin, restaurantId, true),
      getCategoryMenuCollectionIds(admin, categoryId),
    ]);

    const activeIdSet = new Set(menu_collections.map((m) => m.id));
    const menu_collection_ids = linkedIds.filter((id) => activeIdSet.has(id));

    return NextResponse.json({ menu_collections, menu_collection_ids });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Menü bağlantıları okunamadı." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    const { id: categoryId } = await context.params;
    if (!categoryId?.trim()) {
      return NextResponse.json({ error: "Kategori kimliği zorunlu." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const parsed = putCategoryMenuCollectionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Veri doğrulanamadı.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const categoryResult = await getCategoryForOwner(admin, user.id, categoryId);
    if ("error" in categoryResult) {
      return NextResponse.json({ error: categoryResult.error }, { status: categoryResult.status });
    }

    const restaurantId = categoryResult.category.restaurant_id;
    const validation = await validateMenuCollectionIdsForRestaurant(
      admin,
      restaurantId,
      parsed.data.menu_collection_ids,
      { activeOnly: true }
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const uniqueIds = [...new Set(parsed.data.menu_collection_ids)];
    await replaceCategoryMenuCollections(admin, categoryId, uniqueIds);

    return NextResponse.json({ menu_collection_ids: uniqueIds });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: mapDbErrorMessage(e as { code?: string; message?: string }) },
      { status: 500 }
    );
  }
}
