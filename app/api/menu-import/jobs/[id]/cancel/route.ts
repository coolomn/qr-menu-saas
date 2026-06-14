import { NextResponse } from "next/server";
import { cancelPdfImportJob } from "@/lib/menu-import/cancel-pdf-job";
import type { MenuImportJobCancelResponse } from "@/lib/menu-import/import-job";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { loadImportJobForOwner } from "@/lib/menu-import/job-access";

export const runtime = "nodejs";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cancelErrorResponse(error: string, status: number) {
  const body: MenuImportJobCancelResponse = { error };
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return cancelErrorResponse("Oturum gerekli.", 401);
    }

    const { id: jobId } = await context.params;
    if (!jobId?.trim() || !UUID_RE.test(jobId.trim())) {
      return cancelErrorResponse("Geçersiz iş kimliği.", 400);
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return cancelErrorResponse(svc.error, 503);
    }

    const loaded = await loadImportJobForOwner(svc.client, jobId, user);
    if (!loaded.ok) {
      return cancelErrorResponse(loaded.error, loaded.status);
    }

    const result = await cancelPdfImportJob(svc.client, loaded.job, user.id);
    if (!result.ok) {
      return cancelErrorResponse(result.error, result.status);
    }

    const body: MenuImportJobCancelResponse = { ok: true };
    return NextResponse.json(body, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error("menu-import/jobs/[id]/cancel failed:", e);
    return cancelErrorResponse("İş iptal edilemedi.", 500);
  }
}
