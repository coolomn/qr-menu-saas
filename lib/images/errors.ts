export const IMAGE_ERROR_UNSUPPORTED =
  "Lütfen JPG, PNG veya WebP formatında bir görsel seçin.";

export const IMAGE_ERROR_TOO_LARGE =
  "Bu görsel işlenemeyecek kadar büyük. JPG, PNG veya WebP formatında, en fazla 20 MB bir görsel yükleyin.";

export const IMAGE_ERROR_DECODE =
  "Bu görsel okunamadı. JPG, PNG veya WebP deneyin.";

export const IMAGE_ERROR_ENCODE =
  "Görsel işlenemedi. Lütfen başka bir dosya deneyin.";

export const IMAGE_ERROR_OUTPUT_TOO_LARGE =
  "Görsel optimize edilemedi. Daha sade veya daha düşük çözünürlüklü bir fotoğraf deneyin.";

export class ImagePrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagePrepareError";
  }
}
