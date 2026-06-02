import sharp from "sharp";

const MAX_IMAGE_SIDE = 1800;
const JPEG_QUALITY = 78;
const SKIP_OPTIMIZE_BYTES = 350 * 1024;

export type OptimizedImageResult = {
  buffer: Buffer;
  mime: string;
  originalBytes: number;
  optimizedBytes: number;
  originalWidth: number | null;
  originalHeight: number | null;
  optimizedWidth: number | null;
  optimizedHeight: number | null;
  optimized: boolean;
};

export async function optimizeImageForAnalyze(
  input: Buffer,
  inputMime: string
): Promise<OptimizedImageResult> {
  const originalBytes = input.length;
  const image = sharp(input, { failOn: "none" });
  const metadata = await image.metadata();
  const originalWidth = metadata.width ?? null;
  const originalHeight = metadata.height ?? null;
  const largestSide = Math.max(originalWidth ?? 0, originalHeight ?? 0);

  const shouldSkip = originalBytes <= SKIP_OPTIMIZE_BYTES && largestSide > 0 && largestSide <= MAX_IMAGE_SIDE;
  if (shouldSkip) {
    return {
      buffer: input,
      mime: inputMime || "image/jpeg",
      originalBytes,
      optimizedBytes: originalBytes,
      originalWidth,
      originalHeight,
      optimizedWidth: originalWidth,
      optimizedHeight: originalHeight,
      optimized: false,
    };
  }

  const transformed = sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: JPEG_QUALITY,
      mozjpeg: true,
      force: true,
    });

  const outputBuffer = await transformed.toBuffer();
  const outputMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    mime: "image/jpeg",
    originalBytes,
    optimizedBytes: outputBuffer.length,
    originalWidth,
    originalHeight,
    optimizedWidth: outputMeta.width ?? null,
    optimizedHeight: outputMeta.height ?? null,
    optimized: true,
  };
}
