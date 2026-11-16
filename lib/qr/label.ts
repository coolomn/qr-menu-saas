/**
 * Faz 2.6: masa / oda etiketi. QR adresine `?masa=5` veya `?oda=101` eklenir; müşteri menüsü
 * bunu yalnızca bilgi olarak gösterir (sipariş yok). Değer URL'den geldiği için güvenilmez kabul edilir:
 * kısaltılır, izinli karakterlere indirilir, metin olarak (React kaçışıyla) yazılır.
 */
import { pickLang } from "@/lib/i18n/languages";

export type QrLabelKind = "masa" | "oda";

export const QR_LABEL_KINDS: readonly QrLabelKind[] = ["masa", "oda"];
export const QR_LABEL_MAX_LENGTH = 16;
/** Tek seferde üretilebilecek en fazla etiket (toplu kart sayfası). */
export const QR_LABEL_BATCH_MAX = 200;

const DISALLOWED = /[^\p{L}\p{N} .\-_/#]/gu;

/** Etiket değerini temizler; boş kalırsa "" döner. */
export function sanitizeLabelValue(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFC")
    .replace(DISALLOWED, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, QR_LABEL_MAX_LENGTH)
    .trim();
}

/** Menü adresine masa/oda parametresini ekler (varsa mevcut parametreler korunur). */
export function withLabelParam(baseUrl: string, kind: QrLabelKind, value: string): string {
  const clean = sanitizeLabelValue(value);
  if (!clean) return baseUrl;
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}${kind}=${encodeURIComponent(clean)}`;
}

export type QrLabel = { kind: QrLabelKind; value: string };

/** location.search → etiket. Hem masa hem oda varsa oda önceliklidir (otel senaryosu). */
export function readLabelFromSearch(search: string | null | undefined): QrLabel | null {
  if (!search) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  for (const kind of ["oda", "masa"] as const) {
    const value = sanitizeLabelValue(params.get(kind));
    if (value) return { kind, value };
  }
  return null;
}

/** Müşteri menüsünde ve kartta görünen kelime ("Masa" / "Oda" ve çevirileri). */
export function labelKindWord(kind: QrLabelKind, language: string): string {
  if (kind === "oda") {
    return pickLang(language, {
      tr: "Oda",
      en: "Room",
      ru: "Номер",
      de: "Zimmer",
      fr: "Chambre",
      es: "Habitación",
      it: "Camera",
      uk: "Номер",
      zh: "房间",
      az: "Otaq",
    });
  }
  return pickLang(language, {
    tr: "Masa",
    en: "Table",
    ru: "Стол",
    de: "Tisch",
    fr: "Table",
    es: "Mesa",
    it: "Tavolo",
    uk: "Стіл",
    zh: "桌号",
    az: "Masa",
  });
}

export function formatLabel(label: QrLabel, language: string): string {
  return `${labelKindWord(label.kind, language)} ${label.value}`;
}

export type ExpandResult = { values: string[]; error: string | null };

/**
 * "1-20", "1,2,5", "101-110, 120, Bahçe 3" → ["1", ...]. Aralık yalnız iki ucu da tam sayı ise.
 * Çift kayıtlar atılır; en fazla QR_LABEL_BATCH_MAX değer.
 */
export function expandLabelInput(input: string, max = QR_LABEL_BATCH_MAX): ExpandResult {
  const seen = new Set<string>();
  const values: string[] = [];
  const parts = input
    .split(/[,;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const range = /^(\d{1,6})\s*-\s*(\d{1,6})$/.exec(part);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (to < from) return { values: [], error: `"${part}" aralığında başlangıç bitişten büyük olamaz.` };
      if (to - from + 1 > max) return { values: [], error: `Tek seferde en fazla ${max} etiket üretilebilir.` };
      for (let n = from; n <= to; n += 1) {
        const v = sanitizeLabelValue(String(n));
        if (v && !seen.has(v)) {
          seen.add(v);
          values.push(v);
        }
        if (values.length > max) return { values: [], error: `Tek seferde en fazla ${max} etiket üretilebilir.` };
      }
      continue;
    }
    const v = sanitizeLabelValue(part);
    if (v && !seen.has(v)) {
      seen.add(v);
      values.push(v);
    }
    if (values.length > max) return { values: [], error: `Tek seferde en fazla ${max} etiket üretilebilir.` };
  }
  return { values, error: null };
}
