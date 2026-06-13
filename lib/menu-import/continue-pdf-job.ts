import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupImportFile } from "./cleanup-import-file";
import { pdfProgressMessage, type MenuImportJobRow } from "./import-job";
import { optimizeImageForAnalyze } from "./image-optimize";
import { structureMenuFromImageBase64 } from "./openai-menu";
import { mergeImportMenuPayloads } from "./payload-merge";
import { resolveImportDownloadTarget } from "./paths";
import { assertPdfMagicBytes } from "./pdf-meta";
import { loadPdfDocument, renderPdfPageToPngBuffer } from "./pdf-render";
import type { ImportMenuPayload } from "./schema";

export type ContinuePdfJobResult = {
  advanced: boolean;
  job: MenuImportJobRow;
};

async function failImportJob(
  admin: SupabaseClient,
  job: MenuImportJobRow,
  userId: string,
  message: string
): Promise<MenuImportJobRow> {
  const completedAt = new Date().toISOString();
  const { data: failedJob, error } = await admin
    .from("menu_import_jobs")
    .update({
      status: "failed",
      error_message: message.slice(0, 2000),
      progress_phase: "failed",
      progress_message: null,
      completed_at: completedAt,
    })
    .eq("id", job.id)
    .select(
      "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
    )
    .single();

  await cleanupImportFile(admin, job.storage_path, userId);

  if (error || !failedJob) {
    console.error("[menu-import] fail job update failed:", job.id, error?.message);
    return {
      ...job,
      status: "failed",
      error_message: message.slice(0, 2000),
      progress_phase: "failed",
      completed_at: completedAt,
    };
  }

  return failedJob as MenuImportJobRow;
}

async function completeImportJob(
  admin: SupabaseClient,
  job: MenuImportJobRow,
  userId: string,
  payload: ImportMenuPayload,
  pageCount: number,
  openaiCalls: number
): Promise<MenuImportJobRow> {
  const completedAt = new Date().toISOString();
  const { data: completedJob, error } = await admin
    .from("menu_import_jobs")
    .update({
      status: "completed",
      parsed_json: payload,
      error_message: null,
      pages_processed: pageCount,
      progress_phase: "completed",
      progress_message: null,
      openai_calls: openaiCalls,
      completed_at: completedAt,
    })
    .eq("id", job.id)
    .select(
      "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
    )
    .single();

  await cleanupImportFile(admin, job.storage_path, userId);

  if (error || !completedJob) {
    throw new Error("İş tamamlanırken kayıt güncellenemedi.");
  }

  return completedJob as MenuImportJobRow;
}

function parsePagePayloads(value: unknown): ImportMenuPayload[] {
  if (!Array.isArray(value)) return [];
  return value as ImportMenuPayload[];
}

/** Async PDF job için bir sonraki sayfayı işler. Race guard içerir. */
export async function continuePdfImportJob(
  admin: SupabaseClient,
  job: MenuImportJobRow,
  userId: string
): Promise<ContinuePdfJobResult> {
  if (job.source_type !== "pdf") {
    return { advanced: false, job };
  }

  if (job.status === "completed" || job.status === "failed") {
    return { advanced: false, job };
  }

  const pageCount = job.page_count ?? 0;
  if (pageCount < 1) {
    const failed = await failImportJob(admin, job, userId, "Geçersiz PDF sayfa sayısı.");
    return { advanced: false, job: failed };
  }

  if (job.pages_processed >= pageCount) {
    const { data: freshJob } = await admin
      .from("menu_import_jobs")
      .select(
        "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
      )
      .eq("id", job.id)
      .single();
    return { advanced: false, job: (freshJob as MenuImportJobRow) ?? job };
  }

  const expectedProcessed = job.pages_processed;
  const nextPage = expectedProcessed + 1;

  const { data: claimed, error: claimErr } = await admin
    .from("menu_import_jobs")
    .update({
      status: "processing",
      progress_phase: "rasterizing",
      progress_message: pdfProgressMessage(expectedProcessed, pageCount),
      started_at: job.started_at ?? new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("pages_processed", expectedProcessed)
    .in("status", ["pending", "processing"])
    .in("progress_phase", ["queued", "analyzing"])
    .select(
      "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
    )
    .maybeSingle();

  if (claimErr) {
    console.error("[menu-import] continue claim failed:", job.id, claimErr.message);
    throw new Error("İş devam ettirilemedi.");
  }

  if (!claimed) {
    const { data: freshJob } = await admin
      .from("menu_import_jobs")
      .select(
        "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
      )
      .eq("id", job.id)
      .single();
    return { advanced: false, job: (freshJob as MenuImportJobRow) ?? job };
  }

  let workingJob = claimed as MenuImportJobRow;

  try {
    const { bucket, path: downloadPath } = resolveImportDownloadTarget(
      workingJob.storage_path,
      userId
    );
    const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(downloadPath);
    if (dlErr || !blob) {
      throw new Error(dlErr?.message || "Dosya indirilemedi.");
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    assertPdfMagicBytes(buffer);

    const doc = await loadPdfDocument(buffer);
    if (nextPage > doc.numPages) {
      throw new Error("PDF sayfa sayısı beklenenden az.");
    }

    await admin
      .from("menu_import_jobs")
      .update({
        progress_phase: "analyzing",
        progress_message: pdfProgressMessage(expectedProcessed, pageCount),
      })
      .eq("id", job.id);

    const png = await renderPdfPageToPngBuffer(doc, nextPage);
    const optimized = await optimizeImageForAnalyze(png);
    console.info("[menu-import/continue-pdf] page", {
      jobId: job.id,
      page: nextPage,
      totalPages: pageCount,
      optimizedBytes: optimized.optimizedBytes,
    });

    const b64 = optimized.buffer.toString("base64");
    const pagePayload = await structureMenuFromImageBase64(optimized.mime, b64);

    const pagePayloads = [...parsePagePayloads(workingJob.page_payloads), pagePayload];
    const openaiCalls = workingJob.openai_calls + 1;

    if (nextPage >= pageCount) {
      await admin
        .from("menu_import_jobs")
        .update({
          page_payloads: pagePayloads,
          openai_calls: openaiCalls,
          progress_phase: "merging",
          progress_message: "Sayfa sonuçları birleştiriliyor…",
        })
        .eq("id", job.id);

      const merged = mergeImportMenuPayloads(pagePayloads);
      const completedJob = await completeImportJob(
        admin,
        workingJob,
        userId,
        merged,
        pageCount,
        openaiCalls
      );
      return { advanced: true, job: completedJob };
    }

    const { data: updatedJob, error: updateErr } = await admin
      .from("menu_import_jobs")
      .update({
        pages_processed: nextPage,
        page_payloads: pagePayloads,
        openai_calls: openaiCalls,
        progress_phase: "analyzing",
        progress_message: pdfProgressMessage(nextPage, pageCount),
      })
      .eq("id", job.id)
      .select(
        "id, restaurant_id, user_id, status, storage_path, file_mime, parsed_json, error_message, source_type, page_count, pages_processed, progress_phase, progress_message, page_payloads, openai_calls, started_at, completed_at, created_at, updated_at"
      )
      .single();

    if (updateErr || !updatedJob) {
      throw new Error("Sayfa ilerlemesi kaydedilemedi.");
    }

    workingJob = updatedJob as MenuImportJobRow;
    return { advanced: true, job: workingJob };
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : "Bilinmeyen hata";
    console.error("[menu-import] continue-pdf failed:", job.id, e);
    const failedJob = await failImportJob(admin, workingJob, userId, rawMessage);
    return { advanced: true, job: failedJob };
  }
}
