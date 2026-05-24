import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type Body = { restaurantId?: string };

/**
 * Restoran sahibinin tüm kategorilerini ve ürünlerini siler.
 * Önce ürünler (FK), sonra kategoriler.
 */
export async function POST(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }

    const restaurantId = body.restaurantId?.trim();
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId gerekli." }, { status: 400 });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const { data: rest, error: rErr } = await admin
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (rErr || !rest) {
      return NextResponse.json({ error: "Yetkisiz veya restoran bulunamadı." }, { status: 403 });
    }

    const { data: cats, error: cErr } = await admin.from("categories").select("id").eq("restaurant_id", restaurantId);
    if (cErr) {
      console.error(cErr);
      return NextResponse.json({ error: "Kategoriler okunamadı." }, { status: 500 });
    }

    const ids = (cats ?? []).map((c: { id: string }) => c.id);
    if (ids.length > 0) {
      const { error: pErr } = await admin.from("products").delete().in("category_id", ids);
      if (pErr) {
        console.error(pErr);
        return NextResponse.json({ error: pErr.message || "Ürünler silinemedi." }, { status: 500 });
      }
    }

    const { error: dErr } = await admin.from("categories").delete().eq("restaurant_id", restaurantId);
    if (dErr) {
      console.error(dErr);
      return NextResponse.json({ error: dErr.message || "Kategoriler silinemedi." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Bilinmeyen hata." }, { status: 500 });
  }
}
