import { prepareImage, type PreparedImage } from "@/lib/images/prepare-image";

export const PRODUCT_FULL_MAX_LONG_EDGE = 1600;
export const PRODUCT_THUMBNAIL_MAX_WIDTH = 400;
export const PRODUCT_IMAGE_QUALITY = 0.82;
export const WELCOME_BACKGROUND_MAX_WIDTH = 1920;
export const WELCOME_BACKGROUND_QUALITY = 0.82;
export const WELCOME_BACKGROUND_QUALITY_STEPS = [0.82, 0.78, 0.74, 0.7, 0.65, 0.6] as const;
export const WELCOME_BACKGROUND_WIDTH_STEPS = [1920, 1600, 1440, 1280, 1080] as const;
export const WELCOME_BACKGROUND_TARGET_BYTES = 1024 * 1024;
export const WELCOME_BACKGROUND_MAX_OUTPUT_BYTES = Math.round(1.5 * 1024 * 1024);

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

export function welcomeBackgroundImageSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = WELCOME_BACKGROUND_MAX_WIDTH
): { width: number; height: number } {
  const w = Math.max(1, Math.round(sourceWidth));
  const h = Math.max(1, Math.round(sourceHeight));
  if (w <= maxWidth) return { width: w, height: h };
  const scale = maxWidth / w;
  return { width: maxWidth, height: Math.max(1, Math.round(h * scale)) };
}

export function buildWelcomeBackgroundObjectPath(
  restaurantId: string,
  unique: string,
  ext: string
): string {
  return `restaurants/${restaurantId}/background/${unique}.${ext}`;
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

/** Karşılama arka planı: max 1920 px WebP, ~1 MB hedef / 1.5 MB tercih. Boyut yüzünden reddetmez. */
export async function prepareWelcomeBackgroundImage(file: File): Promise<PreparedImage> {
  return prepareImage(file, {
    maxWidth: WELCOME_BACKGROUND_MAX_WIDTH,
    quality: WELCOME_BACKGROUND_QUALITY,
    keepAlpha: false,
    targetOutputBytes: WELCOME_BACKGROUND_TARGET_BYTES,
    maxOutputBytes: WELCOME_BACKGROUND_MAX_OUTPUT_BYTES,
    qualitySteps: [...WELCOME_BACKGROUND_QUALITY_STEPS],
    maxWidthSteps: [...WELCOME_BACKGROUND_WIDTH_STEPS],
  });
}
