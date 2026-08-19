import {
  IMAGE_ERROR_DECODE,
  IMAGE_ERROR_ENCODE,
  IMAGE_ERROR_OUTPUT_TOO_LARGE,
  IMAGE_ERROR_TOO_LARGE,
  IMAGE_ERROR_UNSUPPORTED,
  ImagePrepareError,
} from "@/lib/images/errors";

/** Kullanıcının seçebileceği kaynak dosya tavanı (Storage boyutu değil). */
export const MAX_IMAGE_SOURCE_BYTES = 20 * 1024 * 1024;

/** Storage bucket ile uyumlu çıktı tavanı. */
export const MAX_IMAGE_OUTPUT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export type PreparedImage = {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
};

export type PrepareImageOptions = {
  /** Uzun kenar üst sınırı; oran korunur, büyütme yok. */
  maxLongEdge?: number;
  /** Genişlik üst sınırı (thumbnail); oran korunur, büyütme yok. */
  maxWidth?: number;
  quality: number;
  keepAlpha?: boolean;
  /** Thumbnail gibi zaten doğrulanmış blob’larda kaynak MIME/boyut kontrolünü atla. */
  skipSourceValidation?: boolean;
};

export function isAllowedImageMime(type: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(type.trim().toLowerCase());
}

export function assertImageSource(file: { type?: string; size: number }): void {
  const type = (file.type ?? "").trim().toLowerCase();
  if (type && !isAllowedImageMime(type)) {
    throw new ImagePrepareError(IMAGE_ERROR_UNSUPPORTED);
  }
  if (!type) {
    throw new ImagePrepareError(IMAGE_ERROR_UNSUPPORTED);
  }
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    throw new ImagePrepareError(IMAGE_ERROR_TOO_LARGE);
  }
}

export function fitWithinLongEdge(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge: number
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

export function fitWithinMaxWidth(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number
): { width: number; height: number } {
  const w = Math.max(1, Math.round(sourceWidth));
  const h = Math.max(1, Math.round(sourceHeight));
  if (w <= maxWidth) return { width: w, height: h };
  const scale = maxWidth / w;
  return { width: maxWidth, height: Math.max(1, Math.round(h * scale)) };
}

function targetSize(
  sourceWidth: number,
  sourceHeight: number,
  options: PrepareImageOptions
): { width: number; height: number } {
  if (typeof options.maxWidth === "number") {
    return fitWithinMaxWidth(sourceWidth, sourceHeight, options.maxWidth);
  }
  if (typeof options.maxLongEdge === "number") {
    return fitWithinLongEdge(sourceWidth, sourceHeight, options.maxLongEdge);
  }
  return {
    width: Math.max(1, Math.round(sourceWidth)),
    height: Math.max(1, Math.round(sourceHeight)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/**
 * Kaynağı yeniden boyutlandırır ve WebP (yoksa JPEG) üretir.
 * Orijinal File/Blob’u olduğu gibi döndürmez.
 */
export async function prepareImage(
  source: File | Blob,
  options: PrepareImageOptions
): Promise<PreparedImage> {
  if (!options.skipSourceValidation) {
    assertImageSource(source);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new ImagePrepareError(IMAGE_ERROR_DECODE);
  }

  try {
    let longEdgeLimit =
      typeof options.maxLongEdge === "number" ? options.maxLongEdge : Math.max(bitmap.width, bitmap.height);
    let maxWidthLimit = typeof options.maxWidth === "number" ? options.maxWidth : null;
    let quality = options.quality;

    for (let attempt = 0; attempt < 10; attempt++) {
      const size = targetSize(bitmap.width, bitmap.height, {
        ...options,
        maxLongEdge: options.maxLongEdge != null ? longEdgeLimit : undefined,
        maxWidth: maxWidthLimit ?? undefined,
      });

      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      if (!options.keepAlpha) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size.width, size.height);
      }
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);

      const webp = await canvasToBlob(canvas, "image/webp", quality);
      let encoded: PreparedImage | null = null;
      if (webp && webp.size > 0) {
        encoded = { blob: webp, contentType: "image/webp", ext: "webp" };
      } else {
        const jpeg = await canvasToBlob(canvas, "image/jpeg", Math.max(quality, 0.85));
        if (jpeg && jpeg.size > 0) {
          encoded = { blob: jpeg, contentType: "image/jpeg", ext: "jpg" };
        }
      }

      if (!encoded) {
        throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
      }

      if (encoded.blob.size <= MAX_IMAGE_OUTPUT_BYTES) {
        return encoded;
      }

      quality = Math.max(0.5, quality - 0.07);
      if (maxWidthLimit != null) {
        maxWidthLimit = Math.max(240, Math.floor(maxWidthLimit * 0.82));
      } else {
        longEdgeLimit = Math.max(720, Math.floor(longEdgeLimit * 0.82));
      }
    }
  } finally {
    bitmap.close();
  }

  throw new ImagePrepareError(IMAGE_ERROR_OUTPUT_TOO_LARGE);
}
