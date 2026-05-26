import { NextResponse } from "next/server";
import {
  getNextMenuCollectionSortOrder,
  getOwnerRestaurant,
  listMenuCollectionsForRestaurant,
  mapDbErrorMessage,
  toListItem,
} from "@/lib/admin-menu/helpers";
import { createMenuCollectionSchema } from "@/lib/admin-menu/validation";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    const restaurantId = new URL(request.url).searchParams.get("restaurantId")?.trim();
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId zorunlu." }, { status: 400 });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const owner = await getOwnerRestaurant(admin, user.id, restaurantId);
    if ("error" in owner) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }

    const items = await listMenuCollectionsForRestaurant(admin, restaurantId);
    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Menüler okunamadı." }, { status: 500 });
  }
}

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

    const parsed = createMenuCollectionSchema.safeParse(body);
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

    const { restaurantId, sort_order: requestedSort, ...fields } = parsed.data;
    const owner = await getOwnerRestaurant(admin, user.id, restaurantId);
    if ("error" in owner) {
      return NextResponse.json({ error: owner.error }, { status: owner.status });
    }

    const sort_order =
      typeof requestedSort === "number"
        ? requestedSort
        : await getNextMenuCollectionSortOrder(admin, restaurantId);

    const { data: inserted, error: insertErr } = await admin
      .from("menu_collections")
      .insert([
        {
          restaurant_id: restaurantId,
          name: fields.name,
          name_en: fields.name_en,
          name_ru: fields.name_ru,
          description: fields.description,
          start_time: fields.start_time,
          end_time: fields.end_time,
          is_active: fields.is_active ?? true,
          sort_order,
        },
      ])
      .select(
        "id, restaurant_id, name, name_en, name_ru, description, start_time, end_time, is_active, sort_order, created_at, updated_at"
      )
      .single();

    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: mapDbErrorMessage(insertErr) },
        { status: isUniqueViolationStatus(insertErr) ? 409 : 500 }
      );
    }

    const item = toListItem(inserted, 0);
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Menü oluşturulamadı." }, { status: 500 });
  }
}

function isUniqueViolationStatus(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message || "");
}
