/**
 * Faz 2.6: masa / oda kartı ve yazdırma sayfası. Kart bir SVG'dir (A6 oranı 105×148 mm → 1050×1480 birim);
 * aynı SVG ekranda önizlenir, PNG olarak indirilir ve yazdırma sayfasında vektör olarak basılır.
 * Yazı tipi: kullanıcının sisteminde olan sans-serif (SVG indirildiğinde yazı tipi gömülemez).
 */
import { buildQrSvg, contrastRatio, normalizeHexColor, type QrSvgOptions } from "./svg";

export const CARD_WIDTH = 1050;
export const CARD_HEIGHT = 1480;

export type CardLabel = { word: string; value: string };

export type CardOptions = {
  /** Kartın QR'ının adresi. */
  url: string;
  qr: Omit<QrSvgOptions, "text">;
  restaurantName: string;
  /** Üstte gösterilecek logo (data URL); yoksa yalnız işletme adı. */
  logoHref?: string | null;
  headline: string;
  /** "Masa 5" gibi büyük etiket; yoksa kartta etiket bandı olmaz. */
  label?: CardLabel | null;
  /** Etiket bandı ve çerçeve rengi. */
  accent: string;
  cardBackground: string;
  /** QR'ın altında okunabilir kısa adres ("qr.tapmenu.com.tr/slug"). */
  displayUrl?: string | null;
};

const FONT = `Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif`;

export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Boşluğa göre en çok `maxLines` satıra böler; sığmayanı "…" ile keser. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1] ?? "";
    kept[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
    return kept;
  }
  return lines.map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1).trimEnd()}…` : l));
}

/** Zemin rengine göre okunur yazı rengi (siyah/beyaz). */
export function readableTextOn(background: string): string {
  const bg = normalizeHexColor(background, "#ffffff");
  return contrastRatio("#ffffff", bg) >= contrastRatio("#111827", bg) ? "#ffffff" : "#111827";
}

export function buildCardSvg(options: CardOptions): string {
  const accent = normalizeHexColor(options.accent, "#2563eb");
  const cardBg = normalizeHexColor(options.cardBackground, "#ffffff");
  const textColor = readableTextOn(cardBg);
  const labelText = readableTextOn(accent);
  const panelColor =
    options.qr.background === "transparent" ? "#ffffff" : normalizeHexColor(options.qr.background, "#ffffff");
  const qr = buildQrSvg({ ...options.qr, background: "transparent", logoPlate: panelColor, text: options.url });

  const parts: string[] = [];
  parts.push(`<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="48" fill="${cardBg}"/>`);
  parts.push(`<rect x="24" y="24" width="${CARD_WIDTH - 48}" height="${CARD_HEIGHT - 48}" rx="32" fill="none" stroke="${accent}" stroke-width="6"/>`);

  // Üst blok: logo (varsa) + işletme adı
  let y = 96;
  const logoHref = options.logoHref && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(options.logoHref) ? options.logoHref : null;
  if (logoHref) {
    parts.push(`<image xlink:href="${logoHref}" x="${(CARD_WIDTH - 240) / 2}" y="${y}" width="240" height="130" preserveAspectRatio="xMidYMid meet"/>`);
    y += 130 + 60;
  } else {
    y += 40;
  }
  const nameSize = logoHref ? 54 : 70;
  const nameLines = wrapText(options.restaurantName || "", logoHref ? 24 : 18, 2);
  nameLines.forEach((line, i) => {
    parts.push(
      `<text x="${CARD_WIDTH / 2}" y="${y + i * (nameSize + 10)}" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" font-weight="800" fill="${textColor}">${xmlEscape(line)}</text>`
    );
  });
  y += Math.max(0, nameLines.length - 1) * (nameSize + 10) + 64;

  // Çağrı metni
  const headlineLines = wrapText(options.headline || "", 36, 2);
  headlineLines.forEach((line, i) => {
    parts.push(
      `<text x="${CARD_WIDTH / 2}" y="${y + i * 50}" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="500" fill="${textColor}" fill-opacity="0.78">${xmlEscape(line)}</text>`
    );
  });
  y += Math.max(0, headlineLines.length - 1) * 50 + 36;

  // QR paneli: yuvarlak köşeli zemin (kullanıcının QR arka planı; şeffafsa beyaz). Kod panelin içinde şeffaf çizilir.
  const panel = 660;
  const bandH = 130;
  const bandY = CARD_HEIGHT - 100 - bandH;
  const panelX = (CARD_WIDTH - panel) / 2;
  // Üst blok kısaysa (logo yok) QR bloğu boşlukta ortalanır; uzunsa alttaki bandı itmeden yukarı sıkışır.
  const room = bandY - 20 - 46 - panel - y;
  const panelY = room >= 0 ? y + Math.round(room / 2) : y + room;
  parts.push(`<rect x="${panelX}" y="${panelY}" width="${panel}" height="${panel}" rx="36" fill="${panelColor}"/>`);
  parts.push(
    `<svg x="${panelX}" y="${panelY}" width="${panel}" height="${panel}" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="${qr.shapeRendering}">${qr.body}</svg>`
  );

  if (options.displayUrl) {
    parts.push(
      `<text x="${CARD_WIDTH / 2}" y="${panelY + panel + 38}" text-anchor="middle" font-family="${FONT}" font-size="28" fill="${textColor}" fill-opacity="0.6">${xmlEscape(options.displayUrl)}</text>`
    );
  }

  // Alt etiket bandı: "MASA 5"
  if (options.label) {
    parts.push(`<rect x="120" y="${bandY}" width="${CARD_WIDTH - 240}" height="${bandH}" rx="65" fill="${accent}"/>`);
    const word = xmlEscape(options.label.word.toLocaleUpperCase("tr-TR"));
    const value = xmlEscape(options.label.value);
    parts.push(
      `<text x="${CARD_WIDTH / 2}" y="${bandY + 88}" text-anchor="middle" font-family="${FONT}" font-size="76" font-weight="800" fill="${labelText}" letter-spacing="2">${word} ${value}</text>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="105mm" height="148mm">${parts.join("")}</svg>`;
}

export type SheetLayout = "a4-1" | "a5-2" | "a6-4";

export const SHEET_LAYOUTS: Record<SheetLayout, { label: string; perPage: number; orientation: "portrait" | "landscape"; cardMm: [number, number] }> = {
  "a4-1": { label: "Sayfada 1 kart (A4 büyük)", perPage: 1, orientation: "portrait", cardMm: [210, 297] },
  "a5-2": { label: "Sayfada 2 kart (A5)", perPage: 2, orientation: "landscape", cardMm: [148.5, 210] },
  "a6-4": { label: "Sayfada 4 kart (A6)", perPage: 4, orientation: "portrait", cardMm: [105, 148.5] },
};

/** Yazdırma sayfası: yalnızca kartları içerir; tarayıcının "Yazdır → PDF olarak kaydet" ile PDF olur. */
export function buildPrintSheetHtml(params: { cards: string[]; layout: SheetLayout; title: string }): string {
  const spec = SHEET_LAYOUTS[params.layout];
  const [w, h] = spec.cardMm;
  const pages: string[][] = [];
  for (let i = 0; i < params.cards.length; i += spec.perPage) pages.push(params.cards.slice(i, i + spec.perPage));
  const multi = spec.perPage > 1;
  const pageHtml = pages
    .map(
      (cards) =>
        `<section class="page">${cards.map((svg) => `<div class="card${multi ? " cut" : ""}">${svg}</div>`).join("")}</section>`
    )
    .join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${xmlEscape(params.title)}</title><style>
@page { size: A4 ${spec.orientation}; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
.page { width: ${spec.orientation === "portrait" ? 210 : 297}mm; height: ${spec.orientation === "portrait" ? 297 : 210}mm; display: flex; flex-wrap: wrap; align-content: flex-start; page-break-after: always; break-after: page; overflow: hidden; }
.page:last-child { page-break-after: auto; break-after: auto; }
.card { width: ${w}mm; height: ${h}mm; }
.card.cut { outline: 0.2mm dashed #cbd5e1; outline-offset: -0.1mm; }
.card svg { display: block; width: 100%; height: 100%; }
@media screen { body { background: #e5e7eb; padding: 12px; } .page { background: #fff; margin: 0 auto 12px; box-shadow: 0 1px 6px rgba(0,0,0,.2); } }
@media print { * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>${pageHtml}</body></html>`;
}
