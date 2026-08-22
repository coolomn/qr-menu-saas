import {
  MAX_IMAGE_SOURCE_BYTES,
  isAllowedImageMime,
} from "@/lib/images/prepare-image";

export const MENU_COLLECTION_CROP_MAX_OUTPUT_EDGE = 1200;

export const IMAGE_CROP_FAILED_MESSAGE =
  "Görsel kırpılamadı. Lütfen başka bir JPG, PNG veya WebP görsel deneyin.";

export type CropAreaPixels = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** High-res square output before final WebP encode; no upscale. */
export function resolveSquareCropOutputSize(
  cropWidth: number,
  cropHeight: number,
  maxEdge = MENU_COLLECTION_CROP_MAX_OUTPUT_EDGE
): { width: number; height: number } {
  const w = Math.max(1, Math.round(cropWidth));
  const h = Math.max(1, Math.round(cropHeight));
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function validateImageSourceFile(file: File): string | null {
  const type = (file.type ?? "").trim().toLowerCase();
  if (!type || !isAllowedImageMime(type)) {
    return "Desteklenmeyen format. JPG, PNG veya WebP seçin.";
  }
  if (file.size > MAX_IMAGE_SOURCE_BYTES) {
    return "Görsel en fazla 20 MB olabilir.";
  }
  return null;
}

function loadImageElement(imageSrc: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error(IMAGE_CROP_FAILED_MESSAGE)));
    image.crossOrigin = "anonymous";
    image.src = imageSrc;
  });
}

/**
 * Crops to a square PNG blob at up to MENU_COLLECTION_CROP_MAX_OUTPUT_EDGE px.
 * Final WebP resize happens once in prepareMenuCollectionCardImage on upload.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: CropAreaPixels
): Promise<Blob> {
  const image = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  const { width, height } = resolveSquareCropOutputSize(
    pixelCrop.width,
    pixelCrop.height
  );
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error(IMAGE_CROP_FAILED_MESSAGE);
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    width,
    height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(IMAGE_CROP_FAILED_MESSAGE));
          return;
        }
        resolve(blob);
      },
      "image/png"
    );
  });
}

export function croppedBlobToFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^.]+$/, "") || "menu-card";
  return new File([blob], `${base}-crop.png`, {
    type: blob.type || "image/png",
    lastModified: Date.now(),
  });
}
