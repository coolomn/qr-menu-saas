import { NextResponse } from "next/server";
import {
  getAvailableMenuCollectionsForCategory,
  getProductForOwner,
  getProductMenuCollectionIds,
  mapDbErrorMessage,
  replaceProductMenuCollections,
  validateProductMenuCollectionIdsForCategory,
} from "@/lib/admin-menu/helpers";
import { putProductMenuCollectionsSchema } from "@/lib/admin-menu/validation";
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

    const { id: productId } = await context.params;
    if (!productId?.trim()) {
      return NextResponse.json({ error: "Ürün kimliği zorunlu." }, { status: 400 });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const productResult = await getProductForOwner(admin, user.id, productId);
    if ("error" in productResult) {
      return NextResponse.json({ error: productResult.error }, { status: productResult.status });
    }

    const { product } = productResult;
    const [available_menu_collections, linkedIds] = await Promise.all([
      getAvailableMenuCollectionsForCategory(admin, product.restaurant_id, product.category_id),
      getProductMenuCollectionIds(admin, productId),
    ]);

    const availableIdSet = new Set(available_menu_collections.map((m) => m.id));
    const selected_menu_collection_ids = linkedIds.filter((id) => availableIdSet.has(id));

    return NextResponse.json({ available_menu_collections, selected_menu_collection_ids });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ürün menü bağlantıları okunamadı." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    const { id: productId } = await context.params;
    if (!productId?.trim()) {
      return NextResponse.json({ error: "Ürün kimliği zorunlu." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const parsed = putProductMenuCollectionsSchema.safeParse(body);
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

    const productResult = await getProductForOwner(admin, user.id, productId);
    if ("error" in productResult) {
      return NextResponse.json({ error: productResult.error }, { status: productResult.status });
    }

    const { product } = productResult;
    const validation = await validateProductMenuCollectionIdsForCategory(
      admin,
      product.restaurant_id,
      product.category_id,
      parsed.data.menu_collection_ids
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    const uniqueIds = [...new Set(parsed.data.menu_collection_ids)];
    await replaceProductMenuCollections(admin, productId, uniqueIds);

    return NextResponse.json({ menu_collection_ids: uniqueIds });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: mapDbErrorMessage(e as { code?: string; message?: string }) },
      { status: 500 }
    );
  }
}
