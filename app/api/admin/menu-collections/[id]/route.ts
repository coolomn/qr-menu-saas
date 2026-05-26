import { NextResponse } from "next/server";
import {
  assertCanDeactivateMenuCollection,
  getCategoryCountsByMenuCollection,
  getMenuCollectionForOwner,
  mapDbErrorMessage,
  toListItem,
} from "@/lib/admin-menu/helpers";
import { patchMenuCollectionSchema } from "@/lib/admin-menu/validation";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Menü kimliği zorunlu." }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const parsed = patchMenuCollectionSchema.safeParse(body);
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

    const existing = await getMenuCollectionForOwner(admin, user.id, id);
    if ("error" in existing) {
      return NextResponse.json({ error: existing.error }, { status: existing.status });
    }

    if (parsed.data.is_active === false && existing.row.is_active) {
      const guard = await assertCanDeactivateMenuCollection(
        admin,
        existing.restaurantId,
        id
      );
      if (!guard.ok) {
        return NextResponse.json({ error: guard.message }, { status: 400 });
      }
    }

    const { data: updated, error: updateErr } = await admin
      .from("menu_collections")
      .update(parsed.data)
      .eq("id", id)
      .select(
        "id, restaurant_id, name, name_en, name_ru, description, start_time, end_time, is_active, sort_order, created_at, updated_at"
      )
      .single();

    if (updateErr || !updated) {
      return NextResponse.json(
        { error: mapDbErrorMessage(updateErr) },
        { status: updateErr?.code === "23505" ? 409 : 500 }
      );
    }

    const counts = await getCategoryCountsByMenuCollection(admin, existing.restaurantId, [id]);
    const item = toListItem(updated, counts.get(id) ?? 0);
    return NextResponse.json({ item });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Menü güncellenemedi." }, { status: 500 });
  }
}
