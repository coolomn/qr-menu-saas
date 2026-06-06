import { NextResponse } from "next/server";
import { getProductForOwner, mapDbErrorMessage } from "@/lib/admin-menu/helpers";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
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

    const { error: deleteErr } = await admin.from("products").delete().eq("id", productId);

    if (deleteErr) {
      console.error(deleteErr);
      return NextResponse.json({ error: mapDbErrorMessage(deleteErr) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: productId });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Ürün silinemedi." }, { status: 500 });
  }
}
