import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportMenuPayload } from "./schema";

export const IMPORT_JOB_SOURCE_TYPES = ["image", "pdf"] as const;
export type ImportJobSourceType = (typeof IMPORT_JOB_SOURCE_TYPES)[number];

export const IMPORT_JOB_STATUSES = ["pending", "processing", "completed", "failed"] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_JOB_PROGRESS_PHASES = [
  "queued",
  "downloading",
  "rasterizing",
  "analyzing",
  "merging",
  "completed",
  "failed",
] as const;
export type ImportJobProgressPhase = (typeof IMPORT_JOB_PROGRESS_PHASES)[number];

export type MenuImportJobRow = {
  id: string;
  restaurant_id: string;
  user_id: string;
  status: ImportJobStatus;
  storage_path: string;
  file_mime: string | null;
  parsed_json: ImportMenuPayload | null;
  error_message: string | null;
  source_type: ImportJobSourceType;
  page_count: number | null;
  pages_processed: number;
  progress_phase: ImportJobProgressPhase | null;
  progress_message: string | null;
  page_payloads: ImportMenuPayload[] | null;
  openai_calls: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /api/menu-import/jobs/[id] yanıt şeması */
export type MenuImportJobStatusResponse = {
  id: string;
  status: ImportJobStatus;
  source_type: ImportJobSourceType;
  page_count: number | null;
  pages_processed: number;
  progress_phase: ImportJobProgressPhase | null;
  progress_message: string | null;
  payload?: ImportMenuPayload;
  error?: string;
  created_at: string;
  updated_at: string;
};

/** POST /api/menu-import/analyze yanıt şeması (sync + gelecek async) */
export type MenuImportAnalyzeResponse = {
  ok: boolean;
  jobId?: string;
  async?: boolean;
  payload?: ImportMenuPayload;
  error?: string;
};

export function mapMenuImportJobRowToStatusResponse(
  row: MenuImportJobRow
): MenuImportJobStatusResponse {
  const response: MenuImportJobStatusResponse = {
    id: row.id,
    status: row.status,
    source_type: row.source_type,
    page_count: row.page_count,
    pages_processed: row.pages_processed,
    progress_phase: row.progress_phase,
    progress_message: row.progress_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (row.status === "completed" && row.parsed_json) {
    response.payload = row.parsed_json;
  }
  if (row.status === "failed" && row.error_message) {
    response.error = row.error_message;
  }

  return response;
}

export async function patchImportJob(
  admin: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from("menu_import_jobs").update(patch).eq("id", jobId);
  if (error) {
    console.error("[menu-import] job patch failed:", jobId, error.message);
  }
}

export function pdfProgressMessage(pagesProcessed: number, pageCount: number): string {
  return `PDF sayfaları analiz ediliyor (${pagesProcessed}/${pageCount})…`;
}
