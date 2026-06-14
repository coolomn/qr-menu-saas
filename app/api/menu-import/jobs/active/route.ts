import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  buildMenuImportActiveJobResponse,
  type MenuImportActiveJobResponse,
} from "@/lib/menu-import/import-job";
import { findActivePdfImportJobForOwner } from "@/lib/menu-import/job-access";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json(
        { error: "Oturum gerekli." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const restaurantId = new URL(request.url).searchParams.get("restaurantId")?.trim();
    if (!restaurantId || !UUID_RE.test(restaurantId)) {
      return NextResponse.json(
        { error: "Geçersiz restoran kimliği." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const result = await findActivePdfImportJobForOwner(svc.client, restaurantId, user);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: NO_STORE_HEADERS }
      );
    }

    const response: MenuImportActiveJobResponse = buildMenuImportActiveJobResponse(result.job);

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("menu-import/jobs/active failed:", e);
    return NextResponse.json(
      { error: "Aktif iş sorgulanamadı." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
