import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  mapMenuImportJobRowToStatusResponse,
  type MenuImportJobRow,
} from "@/lib/menu-import/import-job";

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
    const admin = svc.client;

    const { data: job, error: jobErr } = await admin
      .from("menu_import_jobs")
      .select(
        "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
      )
      .eq("id", jobId)
      .maybeSingle();

    if (jobErr) {
      console.error(jobErr);
      return NextResponse.json({ error: "İş kaydı okunamadı." }, { status: 500, headers: NO_STORE_HEADERS });
    }
    if (!job) {
      return NextResponse.json({ error: "İş bulunamadı." }, { status: 404, headers: NO_STORE_HEADERS });
    }

    const { data: restaurant, error: resErr } = await admin
      .from("restaurants")
      .select("id")
      .eq("id", job.restaurant_id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (resErr || !restaurant) {
      return NextResponse.json({ error: "İş bulunamadı veya yetkiniz yok." }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const response = mapMenuImportJobRowToStatusResponse(job as MenuImportJobRow);
    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("menu-import/jobs/[id] failed:", e);
    return NextResponse.json(
      { error: "İş durumu alınamadı." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
