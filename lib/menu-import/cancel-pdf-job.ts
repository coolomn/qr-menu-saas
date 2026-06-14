import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupImportFile } from "./cleanup-import-file";
import type { MenuImportJobRow } from "./import-job";

const CANCELLED_MESSAGE = "Kullanıcı tarafından iptal edildi.";

export async function cancelPdfImportJob(
  admin: SupabaseClient,
  job: MenuImportJobRow,
  userId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (job.source_type !== "pdf") {
    return { ok: false, status: 400, error: "Yalnızca PDF analizi işleri iptal edilebilir." };
  }

  if (job.status !== "pending" && job.status !== "processing") {
    return {
      ok: false,
      status: 409,
      error: "Bu iş iptal edilemez (zaten tamamlanmış veya başarısız).",
    };
  }

  const completedAt = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("menu_import_jobs")
    .update({
      status: "failed",
      error_message: CANCELLED_MESSAGE,
      progress_phase: "failed",
      progress_message: null,
      completed_at: completedAt,
    })
    .eq("id", job.id)
    .in("status", ["pending", "processing"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[menu-import] cancel job update failed:", job.id, error.message);
    return { ok: false, status: 500, error: "İş iptal edilemedi." };
  }

  if (!updated) {
    return {
      ok: false,
      status: 409,
      error: "Bu iş iptal edilemez (zaten tamamlanmış veya başarısız).",
    };
  }

  await cleanupImportFile(admin, job.storage_path, userId);
  return { ok: true };
}
