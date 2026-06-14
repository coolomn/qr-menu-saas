import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  mapMenuImportJobRowToStatusResponse,
} from "@/lib/menu-import/import-job";
import { loadImportJobForOwner } from "@/lib/menu-import/job-access";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { id: jobId } = await context.params;
    if (!jobId?.trim() || !UUID_RE.test(jobId.trim())) {
      return NextResponse.json({ error: "Geçersiz iş kimliği." }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503, headers: NO_STORE_HEADERS });
    }

    const loaded = await loadImportJobForOwner(svc.client, jobId, user);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status, headers: NO_STORE_HEADERS });
    }

    const response = mapMenuImportJobRowToStatusResponse(loaded.job);
    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("menu-import/jobs/[id] failed:", e);
    return NextResponse.json(
      { error: "İş durumu alınamadı." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
