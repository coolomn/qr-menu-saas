import { prepareImage, type PreparedImage } from "@/lib/images/prepare-image";

export const PRODUCT_FULL_MAX_LONG_EDGE = 1600;
export const PRODUCT_THUMBNAIL_MAX_WIDTH = 400;
export const PRODUCT_IMAGE_QUALITY = 0.82;

export function productFullImageSize(
  sourceWidth: number,
  sourceHeight: number
): { width: number; height: number } {
  const w = Math.max(1, Math.round(sourceWidth));
  const h = Math.max(1, Math.round(sourceHeight));
  const longEdge = Math.max(w, h);
  if (longEdge <= PRODUCT_FULL_MAX_LONG_EDGE) return { width: w, height: h };
  const scale = PRODUCT_FULL_MAX_LONG_EDGE / longEdge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Kart thumbnail: max genişlik 400, oran korunur, büyütme yok. */
export function productThumbnailSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = PRODUCT_THUMBNAIL_MAX_WIDTH
): { width: number; height: number } {
  const w = Math.max(1, Math.round(sourceWidth));
  const h = Math.max(1, Math.round(sourceHeight));
  if (w <= maxWidth) return { width: w, height: h };
  const scale = maxWidth / w;
  return { width: maxWidth, height: Math.max(1, Math.round(h * scale)) };
}

export function buildProductImageObjectPaths(
  restaurantId: string,
  unique: string,
  fullExt: string,
  thumbExt: string
): { original: string; thumbnail: string } {
  return {
    original: `restaurants/${restaurantId}/products/${unique}.${fullExt}`,
    thumbnail: `restaurants/${restaurantId}/products/${unique}-thumb.${thumbExt}`,
  };
}

/** Lightbox / image_url: ~1600 px uzun kenar WebP. Orijinal File dönülmez. */
export async function prepareProductFullImage(file: File): Promise<PreparedImage> {
  return prepareImage(file, {
    maxLongEdge: PRODUCT_FULL_MAX_LONG_EDGE,
    quality: PRODUCT_IMAGE_QUALITY,
    keepAlpha: false,
  });
}

/** Kart / thumbnail_url: ~400 px genişlik WebP. */
export async function prepareProductThumbnail(source: Blob): Promise<PreparedImage> {
  return prepareImage(source, {
    maxWidth: PRODUCT_THUMBNAIL_MAX_WIDTH,
    quality: PRODUCT_IMAGE_QUALITY,
    keepAlpha: false,
    skipSourceValidation: true,
  });
}
