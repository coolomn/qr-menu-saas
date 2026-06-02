import sharp from "sharp";

const MAX_IMAGE_SIDE = 1200;
const JPEG_QUALITY = 65;

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

export async function optimizeImageForAnalyze(input: Buffer): Promise<OptimizedImageResult> {
  const originalBytes = input.length;
  const metadata = await sharp(input, { failOn: "none" }).metadata();
  const originalWidth = metadata.width ?? null;
  const originalHeight = metadata.height ?? null;

  const outputBuffer = await sharp(input, { failOn: "none" })
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
    })
    .toBuffer();

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
