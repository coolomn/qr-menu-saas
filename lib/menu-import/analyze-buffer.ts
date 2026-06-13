import { optimizeImageForAnalyze, type OptimizedImageResult } from "./image-optimize";

/** Raster görseli vision öncesi optimize eder (JPG/PNG/WebP/GIF). */
export async function optimizeBufferForVision(buffer: Buffer): Promise<OptimizedImageResult> {
  return optimizeImageForAnalyze(buffer);
}
