"use client";

/** Yükleme sonrası hedef üst boyut (Supabase / mobil uyumluluk) */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

/** Uzun kenar üst sınırı; büyükse canvas ile küçültülür */
export const MAX_PRODUCT_IMAGE_LONG_EDGE = 2048;

/** İşlemeden önce kaynak dosya tavanı (bellek / tarayıcı koruması) */
const HARD_MAX_INPUT_BYTES = 25 * 1024 * 1024;

/**
 * Ürün görseli: boyut ve çözünürlük kuralları.
 * Küçük ve zaten uygun dosyayı olduğu gibi döndürür; gerekirse JPEG’e sıkıştırır / küçültür.
 */
export async function prepareProductImageForUpload(file: File): Promise<{ blob: Blob; contentType: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Lütfen görsel formatında bir dosya seçin (ör. JPG, PNG, WebP).");
  }
  if (file.size > HARD_MAX_INPUT_BYTES) {
    throw new Error("Dosya çok büyük. En fazla 25 MB kaynak görsel seçebilirsiniz.");
  }

  const probe = await createImageBitmap(file);
  try {
    const maxDim = Math.max(probe.width, probe.height);
    if (file.size <= MAX_PRODUCT_IMAGE_BYTES && maxDim <= MAX_PRODUCT_IMAGE_LONG_EDGE) {
      return { blob: file, contentType: file.type };
    }
  } finally {
    probe.close();
  }

  let bitmap: ImageBitmap | null = await createImageBitmap(file);
  let longEdgeLimit = MAX_PRODUCT_IMAGE_LONG_EDGE;
  let quality = 0.88;

  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!bitmap) break;
      const w0 = bitmap.width;
      const h0 = bitmap.height;
      const longEdge = Math.max(w0, h0);
      let w = w0;
      let h = h0;
      if (longEdge > longEdgeLimit) {
        const scale = longEdgeLimit / longEdge;
        w = Math.max(1, Math.round(w0 * scale));
        h = Math.max(1, Math.round(h0 * scale));
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Görsel işlenemedi.");
      }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      bitmap = null;

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      if (!blob) {
        throw new Error("Görsel kaydedilemedi.");
      }

      if (blob.size <= MAX_PRODUCT_IMAGE_BYTES) {
        return { blob, contentType: "image/jpeg" };
      }

      bitmap = await createImageBitmap(blob);
      longEdgeLimit = Math.max(720, Math.floor(longEdgeLimit * 0.82));
      quality = Math.max(0.5, quality - 0.07);
    }
  } finally {
    bitmap?.close();
  }

  throw new Error(
    "Görsel 5 MB sınırının altına getirilemedi. Daha düşük çözünürlüklü veya daha sade bir fotoğraf deneyin."
  );
}
