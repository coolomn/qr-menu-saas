import {
  buildProductImageObjectPaths,
} from "@/lib/images/prepare-presets";
import type { PreparedImage } from "@/lib/images/prepare-image";

export const PRODUCT_IMAGE_CACHE_CONTROL = "31536000";

export const PRODUCT_THUMB_PREPARE_FAILED_MESSAGE =
  "Ürün küçük görseli oluşturulamadı. Lütfen görseli tekrar deneyin.";

export function formatProductFullPrepareError(detail?: string): string {
  return withDetail("Ürün görseli hazırlanamadı", detail);
}

export function formatProductFullUploadError(detail?: string): string {
  return withDetail("Ürün görseli yüklenemedi", detail);
}

export function formatProductThumbPrepareError(detail?: string): string {
  const cleaned = sanitizeUploadErrorDetail(detail);
  if (!cleaned) return PRODUCT_THUMB_PREPARE_FAILED_MESSAGE;
  return `Ürün küçük görseli oluşturulamadı: ${cleaned}`;
}

export function formatProductThumbUploadError(detail?: string): string {
  return withDetail("Ürün küçük görseli yüklenemedi", detail);
}

export function formatProductImageSaveError(detail?: string): string {
  return withDetail("Ürün kaydedilemedi", detail);
}

function withDetail(prefix: string, detail?: string): string {
  const cleaned = sanitizeUploadErrorDetail(detail);
  return cleaned ? `${prefix}: ${cleaned}` : `${prefix}.`;
}

/** Strip opaque browser network errors from user-facing copy. */
export function sanitizeUploadErrorDetail(detail?: string): string | null {
  if (!detail) return null;
  const trimmed = detail.trim();
  if (!trimmed) return null;
  if (/^typeerror:\s*load failed$/i.test(trimmed)) return null;
  if (/^load failed$/i.test(trimmed)) return null;
  if (/^failed to fetch$/i.test(trimmed)) return null;
  if (/^networkerror/i.test(trimmed)) return null;
  return trimmed;
}

export type ProductImageUploadSuccess = {
  url: string;
  thumbnailUrl: string;
  originalPath: string;
  thumbnailPath: string;
};

export type ProductImageUploadFailure = {
  error: string;
};

export type ProductImageUploadDeps = {
  prepareFull: (file: File) => Promise<PreparedImage>;
  prepareThumbnail: (source: Blob) => Promise<PreparedImage>;
  uploadObject: (args: {
    path: string;
    body: Blob;
    contentType: string;
  }) => Promise<{ ok: true } | { ok: false; message: string }>;
  removeObjects: (paths: string[]) => Promise<void>;
  publicUrlForPath: (path: string) => string;
  newUniqueId: () => string;
};

/**
 * Atomic product image upload: both full + thumbnail must succeed.
 * On any failure after a storage write, newly uploaded objects are cleaned up.
 * Never returns a non-empty image URL with an empty thumbnail URL.
 */
export async function uploadProductImageAtomic(
  restaurantId: string,
  file: File,
  deps: ProductImageUploadDeps
): Promise<ProductImageUploadSuccess | ProductImageUploadFailure> {
  let full: PreparedImage;
  try {
    full = await deps.prepareFull(file);
  } catch (e) {
    return {
      error: formatProductFullPrepareError(e instanceof Error ? e.message : undefined),
    };
  }

  let thumb: PreparedImage;
  try {
    thumb = await deps.prepareThumbnail(full.blob);
  } catch (e) {
    return {
      error: formatProductThumbPrepareError(e instanceof Error ? e.message : undefined),
    };
  }

  if (!thumb.blob || thumb.blob.size <= 0) {
    return { error: PRODUCT_THUMB_PREPARE_FAILED_MESSAGE };
  }

  const unique = deps.newUniqueId();
  const paths = buildProductImageObjectPaths(restaurantId, unique, full.ext, thumb.ext);
  const uploadedPaths: string[] = [];

  const cleanupUploaded = async () => {
    if (uploadedPaths.length === 0) return;
    try {
      await deps.removeObjects([...uploadedPaths]);
    } catch {
      // best-effort
    }
  };

  const fullUpload = await deps.uploadObject({
    path: paths.original,
    body: full.blob,
    contentType: full.contentType,
  });
  if (!fullUpload.ok) {
    return { error: formatProductFullUploadError(fullUpload.message) };
  }
  uploadedPaths.push(paths.original);

  const thumbUpload = await deps.uploadObject({
    path: paths.thumbnail,
    body: thumb.blob,
    contentType: thumb.contentType,
  });
  if (!thumbUpload.ok) {
    await cleanupUploaded();
    return { error: formatProductThumbUploadError(thumbUpload.message) };
  }
  uploadedPaths.push(paths.thumbnail);

  const url = deps.publicUrlForPath(paths.original);
  const thumbnailUrl = deps.publicUrlForPath(paths.thumbnail);
  if (!url.trim() || !thumbnailUrl.trim()) {
    await cleanupUploaded();
    return { error: PRODUCT_THUMB_PREPARE_FAILED_MESSAGE };
  }

  return {
    url,
    thumbnailUrl,
    originalPath: paths.original,
    thumbnailPath: paths.thumbnail,
  };
}
