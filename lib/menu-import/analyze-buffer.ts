import { isPdfMime } from "./mime";
import { optimizeImageForAnalyze, type OptimizedImageResult } from "./image-optimize";
import { assertPdfMagicBytes, assertSinglePagePdf } from "./pdf-meta";
import { renderFirstPdfPageToPngBuffer } from "./pdf-render";

export async function prepareImageBufferForAnalyze(
  buffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  if (!isPdfMime(mimeType)) {
    return buffer;
  }

  assertPdfMagicBytes(buffer);
  await assertSinglePagePdf(buffer);
  return renderFirstPdfPageToPngBuffer(buffer);
}

export async function optimizeBufferForVision(
  buffer: Buffer,
  mimeType: string
): Promise<OptimizedImageResult> {
  const raster = await prepareImageBufferForAnalyze(buffer, mimeType);
  return optimizeImageForAnalyze(raster);
}
