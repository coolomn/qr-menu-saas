/**
 * Faz 2.11d (yalnız tarayıcı): logoyu küçük bir tuvale çizip RGBA piksellerini döndürür.
 * Kayıtlı logo adresten (Supabase public bucket, CORS açık) okunur; olmazsa hata fırlatır.
 */
const MAX_SIDE = 64;

export async function loadLogoPixels(source: File | string): Promise<Uint8ClampedArray> {
  let blob: Blob;
  if (typeof source === "string") {
    const res = await fetch(source, { mode: "cors", cache: "default" });
    if (!res.ok) throw new Error(`logo okunamadı (${res.status})`);
    blob = await res.blob();
  } else {
    blob = source;
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("tuval kullanılamıyor");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  } finally {
    bitmap.close();
  }
}
