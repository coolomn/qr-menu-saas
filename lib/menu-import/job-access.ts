import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { MenuImportJobRow } from "./import-job";

const JOB_SELECT =
  "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at";

export async function loadImportJobForOwner(
  admin: SupabaseClient,
  jobId: string,
  user: User
): Promise<
  | { ok: true; job: MenuImportJobRow }
  | { ok: false; status: number; error: string }
> {
  const { data: job, error: jobErr } = await admin
    .from("menu_import_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) {
    console.error(jobErr);
    return { ok: false, status: 500, error: "İş kaydı okunamadı." };
  }
  if (!job) {
    return { ok: false, status: 404, error: "İş bulunamadı." };
  }

  const { data: restaurant, error: resErr } = await admin
    .from("restaurants")
    .select("id")
    .eq("id", job.restaurant_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (resErr || !restaurant) {
    return { ok: false, status: 403, error: "İş bulunamadı veya yetkiniz yok." };
  }

  return { ok: true, job: job as MenuImportJobRow };
}
