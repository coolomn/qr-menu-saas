import { optimizeImageForAnalyze } from "./image-optimize";
import { structureMenuFromImageBase64 } from "./openai-menu";
import { assertPdfMagicBytes, assertPdfPageCountWithinLimit } from "./pdf-meta";
import { PDF_MAX_PAGES_SYNC } from "./pdf-constants";
import { loadPdfDocument, renderPdfPageToPngBuffer } from "./pdf-render";
import { mergeImportMenuPayloads } from "./payload-merge";
import type { ImportJobProgressPhase } from "./import-job";
import type { ImportMenuPayload } from "./schema";

export type AnalyzePdfProgressUpdate = {
  pagesProcessed: number;
  totalPages: number;
  phase: Extract<ImportJobProgressPhase, "rasterizing" | "analyzing" | "merging">;
};

/** PDF tüm sayfalarını sırayla vision pipeline'dan geçirir ve birleştirir. */
export async function analyzePdfBuffer(
  buffer: Buffer,
  onProgress?: (update: AnalyzePdfProgressUpdate) => void | Promise<void>
): Promise<ImportMenuPayload> {
  assertPdfMagicBytes(buffer);
  const doc = await loadPdfDocument(buffer);
  assertPdfPageCountWithinLimit(doc.numPages, PDF_MAX_PAGES_SYNC);

  const pagePayloads: ImportMenuPayload[] = [];

  for (let page = 1; page <= doc.numPages; page++) {
    await onProgress?.({
      pagesProcessed: page - 1,
      totalPages: doc.numPages,
      phase: "rasterizing",
    });
    const png = await renderPdfPageToPngBuffer(doc, page);
    const optimized = await optimizeImageForAnalyze(png);
    await onProgress?.({
      pagesProcessed: page - 1,
      totalPages: doc.numPages,
      phase: "analyzing",
    });
    console.info("[menu-import/analyze-pdf] page", {
      page,
      totalPages: doc.numPages,
      optimizedBytes: optimized.optimizedBytes,
      optimizedWidth: optimized.optimizedWidth,
      optimizedHeight: optimized.optimizedHeight,
    });
    const b64 = optimized.buffer.toString("base64");
    const payload = await structureMenuFromImageBase64(optimized.mime, b64);
    pagePayloads.push(payload);
    await onProgress?.({
      pagesProcessed: page,
      totalPages: doc.numPages,
      phase: "analyzing",
    });
  }

  await onProgress?.({
    pagesProcessed: doc.numPages,
    totalPages: doc.numPages,
    phase: "merging",
  });

  return mergeImportMenuPayloads(pagePayloads);
}
