import {
  PRODUCT_IMAGE_QUALITY,
  PRODUCT_THUMBNAIL_MAX_WIDTH,
} from "@/lib/images/prepare-presets";
import sharp from "sharp";

export type NodePreparedProductThumbnail = {
  buffer: Buffer;
  contentType: "image/webp";
  ext: "webp";
  width: number;
  height: number;
};

/**
 * Server-side equivalent of `prepareProductThumbnail` (browser canvas).
 * Same constraints: max width 400, no upscale, WebP ~0.82 quality.
 */
export async function prepareProductThumbnailBuffer(
  source: Buffer
): Promise<NodePreparedProductThumbnail> {
  const rotated = sharp(source, { failOn: "none" }).rotate();
  const meta = await rotated.metadata();
  const sourceWidth = meta.width ?? 0;
  if (!sourceWidth) {
    throw new Error("Görsel boyutu okunamadı.");
  }

  const pipeline = rotated.resize({
    width: PRODUCT_THUMBNAIL_MAX_WIDTH,
    withoutEnlargement: true,
  });

  const quality = Math.round(PRODUCT_IMAGE_QUALITY * 100);
  const buffer = await pipeline.webp({ quality, effort: 4 }).toBuffer();
  const outMeta = await sharp(buffer).metadata();

  return {
    buffer,
    contentType: "image/webp",
    ext: "webp",
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
  };
}
