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

export type PreparedImageFormat = "webp" | "jpeg" | "png";

export type PreparedImage = {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg" | "image/png";
  ext: "webp" | "jpg" | "png";
};

export type SniffedImageFormat = "webp" | "jpeg" | "png";

/** Magic-byte sniff; canvas.toBlob bazen yanlış MIME ile blob döndürür. */
export async function sniffBlobImageFormat(blob: Blob): Promise<SniffedImageFormat | null> {
  if (blob.size < 12) return null;
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
    return "png";
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "jpeg";
  }
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function preparedImageForFormat(blob: Blob, format: PreparedImageFormat): PreparedImage {
  const contentType =
    format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = format === "webp" ? "webp" : format === "jpeg" ? "jpg" : "png";
  const normalizedBlob = blob.type === contentType ? blob : new Blob([blob], { type: contentType });
  return { blob: normalizedBlob, contentType, ext };
}

function declaredFormatFromPrepared(prepared: PreparedImage): PreparedImageFormat {
  if (prepared.contentType === "image/webp") return "webp";
  if (prepared.contentType === "image/png") return "png";
  return "jpeg";
}

/** Blob içeriği ile contentType/ext uyumunu garanti eder; upload öncesi kullanılır. */
export async function ensurePreparedImageMimeConsistency(
  prepared: PreparedImage,
  options?: { allowPng?: boolean }
): Promise<PreparedImage> {
  const sniffed = await sniffBlobImageFormat(prepared.blob);
  if (sniffed === "webp") return preparedImageForFormat(prepared.blob, "webp");
  if (sniffed === "jpeg") return preparedImageForFormat(prepared.blob, "jpeg");
  if (sniffed === "png") {
    if (options?.allowPng) return preparedImageForFormat(prepared.blob, "png");
    throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
  }

  const format = declaredFormatFromPrepared(prepared);
  if (format === "png" && !options?.allowPng) {
    throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
  }
  const blobType = prepared.blob.type.trim().toLowerCase();
  if (
    !blobType ||
    blobType === prepared.contentType ||
    (prepared.contentType === "image/jpeg" && blobType === "image/jpg")
  ) {
    return preparedImageForFormat(prepared.blob, format);
  }

  throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
}

export type PrepareImageOptions = {
  /** Uzun kenar üst sınırı; oran korunur, büyütme yok. */
  maxLongEdge?: number;
  /** Genişlik üst sınırı (thumbnail); oran korunur, büyütme yok. */
  maxWidth?: number;
  quality: number;
  keepAlpha?: boolean;
  /** Thumbnail gibi zaten doğrulanmış blob’larda kaynak MIME/boyut kontrolünü atla. */
  skipSourceValidation?: boolean;
  /** Çıktı hard limit (byte). Varsayılan: MAX_IMAGE_OUTPUT_BYTES. */
  maxOutputBytes?: number;
  /**
   * İdeal çıktı tavanı. qualitySteps verildiğinde bu değerin altına inince durulur.
   * Ürün pipeline’ı bu alanı kullanmaz.
   */
  targetOutputBytes?: number;
  /** Welcome: önce kalite merdiveni, sonra maxWidthSteps. */
  qualitySteps?: number[];
  maxWidthSteps?: number[];
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

export function welcomeWidthLadder(sourceWidth: number, steps: number[]): number[] {
  const w = Math.max(1, Math.round(sourceWidth));
  const out: number[] = [];
  for (const step of steps) {
    const capped = Math.min(Math.max(1, Math.round(step)), w);
    if (!out.includes(capped)) out.push(capped);
  }
  return out;
}

export function longEdgeLadder(sourceWidth: number, sourceHeight: number, steps: number[]): number[] {
  const longEdge = Math.max(Math.max(1, Math.round(sourceWidth)), Math.max(1, Math.round(sourceHeight)));
  const out: number[] = [];
  for (const step of steps) {
    const capped = Math.min(Math.max(1, Math.round(step)), longEdge);
    if (!out.includes(capped)) out.push(capped);
  }
  return out;
}

/**
 * Logo çıktı bütçesi: uzun kenar merdiveni + kalite adımları.
 * Hedefin üstünde kalsa da son başarılı encode döner (hard reject yok).
 */
export async function runBudgetedLongEdgeQualityEncode<T>(args: {
  sourceWidth: number;
  sourceHeight: number;
  longEdgeSteps: number[];
  qualitySteps: number[];
  targetBytes: number;
  hardLimitBytes: number;
  encode: (size: BudgetedEncodeSize, quality: number) => Promise<{ bytes: number; value: T }>;
}): Promise<T | null> {
  const longEdges = longEdgeLadder(args.sourceWidth, args.sourceHeight, args.longEdgeSteps);
  let lastSuccessful: T | null = null;
  for (const maxLongEdge of longEdges) {
    const size = fitWithinLongEdge(args.sourceWidth, args.sourceHeight, maxLongEdge);
    let underPreferred: T | null = null;
    let encodeFailed = false;
    for (const quality of args.qualitySteps) {
      try {
        const result = await args.encode(size, quality);
        lastSuccessful = result.value;
        if (result.bytes <= args.targetBytes) return result.value;
        if (result.bytes <= args.hardLimitBytes && !underPreferred) {
          underPreferred = result.value;
        }
      } catch {
        encodeFailed = true;
        break;
      }
    }
    if (underPreferred) return underPreferred;
    if (encodeFailed) continue;
  }
  return lastSuccessful;
}

export function pickBudgetedEncodeResult<T extends { bytes: number }>(
  groupedByPriority: T[][],
  targetBytes: number,
  preferredMaxBytes: number
): T | null {
  let lastSuccessful: T | null = null;
  for (const group of groupedByPriority) {
    let underPreferred: T | null = null;
    for (const candidate of group) {
      lastSuccessful = candidate;
      if (candidate.bytes <= targetBytes) return candidate;
      if (candidate.bytes <= preferredMaxBytes && !underPreferred) {
        underPreferred = candidate;
      }
    }
    if (underPreferred) return underPreferred;
  }
  return lastSuccessful;
}

export type BudgetedEncodeSize = { width: number; height: number };

/**
 * Welcome çıktı bütçesi: 1 MB hedef, 1.5 MB tercih.
 * Başarılı decode/encode varsa boyut yüzünden reddetmez; son basamak (1080 / q0.60)
 * üretilmişse onu kabul eder. Ürün pipeline bu fonksiyonu kullanmaz.
 */
export async function runBudgetedWidthQualityEncode<T>(args: {
  sourceWidth: number;
  sourceHeight: number;
  widthSteps: number[];
  qualitySteps: number[];
  targetBytes: number;
  hardLimitBytes: number;
  encode: (size: BudgetedEncodeSize, quality: number) => Promise<{ bytes: number; value: T }>;
}): Promise<T | null> {
  const widths = welcomeWidthLadder(args.sourceWidth, args.widthSteps);
  let lastSuccessful: T | null = null;
  for (const maxWidth of widths) {
    const size = fitWithinMaxWidth(args.sourceWidth, args.sourceHeight, maxWidth);
    let underPreferred: T | null = null;
    let encodeFailed = false;
    for (const quality of args.qualitySteps) {
      try {
        const result = await args.encode(size, quality);
        lastSuccessful = result.value;
        if (result.bytes <= args.targetBytes) return result.value;
        if (result.bytes <= args.hardLimitBytes && !underPreferred) {
          underPreferred = result.value;
        }
      } catch {
        encodeFailed = true;
        break;
      }
    }
    if (underPreferred) return underPreferred;
    if (encodeFailed) continue;
  }
  return lastSuccessful;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function createImageBitmapBestEffort(
  source: Blob,
  resizeWidth?: number
): Promise<ImageBitmap> {
  if (typeof resizeWidth === "number") {
    return createImageBitmap(source, { resizeWidth });
  }
  return createImageBitmap(source);
}

async function decodeWelcomeBitmap(
  source: Blob,
  widthSteps: number[]
): Promise<ImageBitmap> {
  for (const resizeWidth of widthSteps) {
    try {
      return await createImageBitmapBestEffort(source, resizeWidth);
    } catch {
      continue;
    }
  }
  try {
    return await createImageBitmapBestEffort(source);
  } catch {
    throw new ImagePrepareError(IMAGE_ERROR_DECODE);
  }
}

/** Resize edilmiş canvas üzerinde alpha örnekleme; tam piksel taraması yapmaz. */
export function imageDataHasTransparency(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sampleStep = 1
): boolean {
  const step = Math.max(1, Math.round(sampleStep));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 255) return true;
    }
  }
  return false;
}

function canvasHasTransparency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const sampleStep = Math.max(1, Math.ceil(Math.max(width, height) / 400));
  const imageData = ctx.getImageData(0, 0, width, height);
  return imageDataHasTransparency(imageData.data, width, height, sampleStep);
}

async function encodeLogoCanvas(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  quality: number
): Promise<PreparedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);

  const hasTransparency = canvasHasTransparency(ctx, size.width, size.height);

  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp && webp.size > 0) {
    const sniffed = await sniffBlobImageFormat(webp);
    if (sniffed === "webp") {
      return preparedImageForFormat(webp, "webp");
    }
  }

  if (hasTransparency) {
    const png = await canvasToBlob(canvas, "image/png");
    if (png && png.size > 0) {
      const sniffed = await sniffBlobImageFormat(png);
      if (sniffed === "png") {
        return preparedImageForFormat(png, "png");
      }
    }
    throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
  }

  const jpeg = await canvasToBlob(canvas, "image/jpeg", Math.max(quality, 0.85));
  if (jpeg && jpeg.size > 0) {
    const sniffed = await sniffBlobImageFormat(jpeg);
    if (sniffed === "jpeg") {
      return preparedImageForFormat(jpeg, "jpeg");
    }
  }
  throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
}

export type PrepareLogoImageOptions = {
  maxLongEdge: number;
  quality: number;
  qualitySteps: number[];
  longEdgeSteps: number[];
  targetOutputBytes: number;
  maxOutputBytes: number;
};

/** Logo: WebP → (transparency varsa PNG / yoksa JPEG), uzun kenar bütçeli encode. */
export async function prepareLogoImageFromSource(
  source: File | Blob,
  options: PrepareLogoImageOptions
): Promise<PreparedImage> {
  assertImageSource(source);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch (error) {
    if (error instanceof ImagePrepareError) throw error;
    throw new ImagePrepareError(IMAGE_ERROR_DECODE);
  }

  try {
    const prepared = await runBudgetedLongEdgeQualityEncode({
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      longEdgeSteps: options.longEdgeSteps,
      qualitySteps: options.qualitySteps,
      targetBytes: options.targetOutputBytes,
      hardLimitBytes: options.maxOutputBytes,
      encode: async (size, quality) => {
        const encoded = await encodeLogoCanvas(bitmap, size, quality);
        return { bytes: encoded.blob.size, value: encoded };
      },
    });
    if (prepared) return prepared;
  } finally {
    bitmap.close();
  }

  throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
}

async function encodeCanvas(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
  quality: number,
  keepAlpha: boolean | undefined
): Promise<PreparedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
  }
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);

  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp && webp.size > 0) {
    const sniffed = await sniffBlobImageFormat(webp);
    if (sniffed === "webp") {
      return preparedImageForFormat(webp, "webp");
    }
  }
  const jpeg = await canvasToBlob(canvas, "image/jpeg", Math.max(quality, 0.85));
  if (jpeg && jpeg.size > 0) {
    const sniffed = await sniffBlobImageFormat(jpeg);
    if (sniffed === "jpeg") {
      return preparedImageForFormat(jpeg, "jpeg");
    }
  }
  throw new ImagePrepareError(IMAGE_ERROR_ENCODE);
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

  const qualitySteps = options.qualitySteps;
  const widthSteps = options.maxWidthSteps;
  const useWelcomeBudget =
    Boolean(qualitySteps?.length && widthSteps?.length && typeof options.maxWidth === "number");

  let bitmap: ImageBitmap;
  try {
    bitmap = useWelcomeBudget
      ? await decodeWelcomeBitmap(source, widthSteps ?? [])
      : await createImageBitmap(source);
  } catch (error) {
    if (error instanceof ImagePrepareError) throw error;
    throw new ImagePrepareError(IMAGE_ERROR_DECODE);
  }

  try {
    const hardLimit = options.maxOutputBytes ?? MAX_IMAGE_OUTPUT_BYTES;

    if (useWelcomeBudget && qualitySteps && widthSteps) {
      const targetBytes = options.targetOutputBytes ?? hardLimit;
      const prepared = await runBudgetedWidthQualityEncode({
        sourceWidth: bitmap.width,
        sourceHeight: bitmap.height,
        widthSteps,
        qualitySteps,
        targetBytes,
        hardLimitBytes: hardLimit,
        encode: async (size, quality) => {
          const encoded = await encodeCanvas(bitmap, size, quality, options.keepAlpha);
          return { bytes: encoded.blob.size, value: encoded };
        },
      });
      if (prepared) return prepared;
    } else {
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

        const encoded = await encodeCanvas(bitmap, size, quality, options.keepAlpha);
        if (encoded.blob.size <= hardLimit) {
          return encoded;
        }

        quality = Math.max(0.5, quality - 0.07);
        if (maxWidthLimit != null) {
          maxWidthLimit = Math.max(240, Math.floor(maxWidthLimit * 0.82));
        } else {
          longEdgeLimit = Math.max(720, Math.floor(longEdgeLimit * 0.82));
        }
      }
    }
  } finally {
    bitmap.close();
  }

  throw new ImagePrepareError(IMAGE_ERROR_OUTPUT_TOO_LARGE);
}
