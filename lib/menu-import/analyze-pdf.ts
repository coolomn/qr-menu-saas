import { optimizeImageForAnalyze } from "./image-optimize";
import { structureMenuFromImageBase64 } from "./openai-menu";
import { assertPdfMagicBytes, assertPdfPageCountWithinLimit } from "./pdf-meta";
import { loadPdfDocument, renderPdfPageToPngBuffer } from "./pdf-render";
import { mergeImportMenuPayloads } from "./payload-merge";
import type { ImportMenuPayload } from "./schema";

/** PDF tüm sayfalarını sırayla vision pipeline'dan geçirir ve birleştirir. */
export async function analyzePdfBuffer(buffer: Buffer): Promise<ImportMenuPayload> {
  assertPdfMagicBytes(buffer);
  const doc = await loadPdfDocument(buffer);
  assertPdfPageCountWithinLimit(doc.numPages);

  const pagePayloads: ImportMenuPayload[] = [];

  for (let page = 1; page <= doc.numPages; page++) {
    const png = await renderPdfPageToPngBuffer(doc, page);
    const optimized = await optimizeImageForAnalyze(png);
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
  }

  return mergeImportMenuPayloads(pagePayloads);
}
