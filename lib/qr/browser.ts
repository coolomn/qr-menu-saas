import { setSvgSize } from "./svg";

/** Faz 2.6: yalnızca tarayıcıda çalışan yardımcılar (logo hazırlama, PNG/SVG indirme, yazdırma). */

/** Logoyu 256 px'e küçültüp PNG data URL'e çevirir (SVG/WebP/JPEG fark etmez); 160 px: 200 kartlık sayfada dosya boyutunu küçük tutar. Başarısızsa null. */
export async function loadLogoDataUrl(url: string, maxSide = 160): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo yüklenemedi"));
    });
    img.src = url;
    await loaded;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadSvg(svg: string, filename: string): void {
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** SVG'yi verilen piksel boyutunda PNG'ye çevirir (kenarlar için arka plan şeffaf kalır). */
export async function svgToPngBlob(svg: string, width: number, height: number): Promise<Blob> {
  const sized = setSvgSize(svg, width, height);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVG çizilemedi"));
    });
    img.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas yok");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG üretilemedi"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Gizli bir çerçevede yazdırma penceresini açar (kullanıcı "PDF olarak kaydet"i seçebilir). */
export function printHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  iframe.srcdoc = html;
  let printed = false;
  iframe.onload = () => {
    if (printed) return;
    printed = true;
    const win = iframe.contentWindow;
    if (!win) return;
    win.focus();
    window.setTimeout(() => win.print(), 150);
    window.setTimeout(() => iframe.remove(), 120_000);
  };
  document.body.appendChild(iframe);
}

/** Dosya adı için güvenli parça: "Bahçe 3" → "bahce-3". */
export function fileSlug(text: string): string {
  return (
    text
      .toLocaleLowerCase("tr-TR")
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "kod"
  );
}
