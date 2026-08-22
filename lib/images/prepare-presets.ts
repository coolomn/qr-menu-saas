import {
  ensurePreparedImageMimeConsistency,
  fitWithinLongEdge,
  prepareImage,
  prepareLogoImageFromSource,
  type PreparedImage,
} from "@/lib/images/prepare-image";

export const PRODUCT_FULL_MAX_LONG_EDGE = 1600;
export const PRODUCT_THUMBNAIL_MAX_WIDTH = 400;
export const PRODUCT_IMAGE_QUALITY = 0.82;
/** Menu picker card thumbnail: max long edge ~400, aspect preserved (CSS object-cover on card). */
export const MENU_COLLECTION_CARD_MAX_LONG_EDGE = 400;
export const MENU_COLLECTION_CARD_IMAGE_QUALITY = 0.84;
export const WELCOME_BACKGROUND_MAX_WIDTH = 1920;
export const WELCOME_BACKGROUND_QUALITY = 0.82;
export const WELCOME_BACKGROUND_QUALITY_STEPS = [0.82, 0.78, 0.74, 0.7, 0.65, 0.6] as const;
export const WELCOME_BACKGROUND_WIDTH_STEPS = [1920, 1600, 1440, 1280, 1080] as const;
export const WELCOME_BACKGROUND_TARGET_BYTES = 1024 * 1024;
export const WELCOME_BACKGROUND_MAX_OUTPUT_BYTES = Math.round(1.5 * 1024 * 1024);

export const SLIDER_MAX_WIDTH = 1920;
export const SLIDER_QUALITY = 0.82;
export const SLIDER_QUALITY_STEPS = [0.82, 0.78, 0.74, 0.7, 0.65] as const;
export const SLIDER_WIDTH_STEPS = [1920, 1600, 1440, 1280] as const;
/** Hedef ~750 KB; tercih edilen üst sınır 1 MB. Boyut hedefine inmese de reddetmez. */
export const SLIDER_TARGET_BYTES = Math.round(750 * 1024);
export const SLIDER_MAX_OUTPUT_BYTES = 1024 * 1024;

export const LOGO_MAX_LONG_EDGE = 800;
export const LOGO_QUALITY = 0.86;
export const LOGO_QUALITY_STEPS = [0.86, 0.82, 0.78, 0.74] as const;
export const LOGO_LONG_EDGE_STEPS = [800, 640, 512] as const;
/** Hedef ~250 KB; tercih edilen üst sınır 400 KB. Geçerli logo hard reject edilmez. */
export const LOGO_TARGET_BYTES = Math.round(250 * 1024);
export const LOGO_MAX_OUTPUT_BYTES = Math.round(400 * 1024);

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

export function buildSliderImageObjectPath(
  restaurantId: string,
  unique: string,
  ext: string
): string {
  return `restaurants/${restaurantId}/slider/${unique}.${ext}`;
}

export function buildLogoImageObjectPath(
  restaurantId: string,
  unique: string,
  ext: string
): string {
  return `restaurants/${restaurantId}/logo/${unique}.${ext}`;
}

export function logoImageSize(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge = LOGO_MAX_LONG_EDGE
): { width: number; height: number } {
  return fitWithinLongEdge(sourceWidth, sourceHeight, maxLongEdge);
}

export function sliderImageSize(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth = SLIDER_MAX_WIDTH
): { width: number; height: number } {
  return welcomeBackgroundImageSize(sourceWidth, sourceHeight, maxWidth);
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

export function menuCollectionCardImageSize(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge = MENU_COLLECTION_CARD_MAX_LONG_EDGE
): { width: number; height: number } {
  const w = Math.max(1, Math.round(sourceWidth));
  const h = Math.max(1, Math.round(sourceHeight));
  const longEdge = Math.max(w, h);
  if (longEdge <= maxLongEdge) return { width: w, height: h };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function buildMenuCollectionCardImageObjectPath(
  restaurantId: string,
  unique: string,
  ext: string
): string {
  return `restaurants/${restaurantId}/menu-collections/${unique}.${ext}`;
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

/** Menü vitrin slider: max 1920 px WebP, ~750 KB hedef / 1 MB tercih. Boyut yüzünden reddetmez. */
export async function prepareSliderImage(file: File): Promise<PreparedImage> {
  const prepared = await prepareImage(file, {
    maxWidth: SLIDER_MAX_WIDTH,
    quality: SLIDER_QUALITY,
    keepAlpha: false,
    targetOutputBytes: SLIDER_TARGET_BYTES,
    maxOutputBytes: SLIDER_MAX_OUTPUT_BYTES,
    qualitySteps: [...SLIDER_QUALITY_STEPS],
    maxWidthSteps: [...SLIDER_WIDTH_STEPS],
  });
  return ensurePreparedImageMimeConsistency(prepared);
}

/** Menü seçim kartı: ~400 px uzun kenar WebP, oran korunur, crop yok. */
export async function prepareMenuCollectionCardImage(file: File): Promise<PreparedImage> {
  return prepareImage(file, {
    maxLongEdge: MENU_COLLECTION_CARD_MAX_LONG_EDGE,
    quality: MENU_COLLECTION_CARD_IMAGE_QUALITY,
    keepAlpha: false,
  });
}

/** Restoran logosu: max 800 px uzun kenar, transparency korunur, ~250 KB hedef / 400 KB tercih. */
export async function prepareLogoImage(file: File): Promise<PreparedImage> {
  const prepared = await prepareLogoImageFromSource(file, {
    maxLongEdge: LOGO_MAX_LONG_EDGE,
    quality: LOGO_QUALITY,
    qualitySteps: [...LOGO_QUALITY_STEPS],
    longEdgeSteps: [...LOGO_LONG_EDGE_STEPS],
    targetOutputBytes: LOGO_TARGET_BYTES,
    maxOutputBytes: LOGO_MAX_OUTPUT_BYTES,
  });
  return ensurePreparedImageMimeConsistency(prepared, { allowPng: true });
}
