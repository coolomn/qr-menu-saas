/**
 * Faz 2.9: müşteri menüsü üst duyuru şeridi (tek duyuru, çok dilli metin, isteğe bağlı tarih aralığı).
 *
 * Saklama: `restaurants.announcement jsonb` (varsayılan `{}` = duyuru yok). Biçim:
 *   { enabled: boolean, text: "TR metin", translations: { en: { text: "…" }, … },
 *     starts_on?: "YYYY-MM-DD", ends_on?: "YYYY-MM-DD" }
 * - Tarihler mekan saat diliminde (Europe/Istanbul) değerlendirilir; bitiş günü DAHİLDİR.
 * - Metin düz metindir (React kaçışlar); bağlantı/HTML desteklenmez.
 * Hem admin hem müşteri menüsü kullanır (saf yardımcılar).
 */

import { cleanTranslationsForSave } from "@/lib/i18n/edit-translations";
import { isMenuLanguage } from "@/lib/i18n/languages";
import { parseTranslations, translatedText, type TranslationMap } from "@/lib/i18n/translations";
import { DEFAULT_SCHEDULE_TIMEZONE, localNow } from "@/lib/public-menu/schedule";

/** DB CHECK (announcement_ok) ve formla aynı sınır. */
export const ANNOUNCEMENT_MAX_LENGTH = 200;

export type Announcement = {
  enabled: boolean;
  /** Türkçe (ana) metin. */
  text: string;
  /** Diğer diller: { en: { text } }. */
  translations: TranslationMap;
  starts_on: string | null;
  ends_on: string | null;
};

export function emptyAnnouncement(): Announcement {
  return { enabled: false, text: "", translations: {}, starts_on: null, ends_on: null };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Kod noktası (emoji dahil) bazında keser; UTF-16 çiftini ortadan bölmez (Postgres jsonb reddederdi). */
function truncateChars(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join("").trim();
}

/** Tek satıra indirger (satır sonu/yinelenen boşluk → tek boşluk), kırpar. */
function cleanLine(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** DB'den gelen ham jsonb → güvenli duyuru. Geçersiz/boş ham değer → duyuru yok. */
export function parseAnnouncement(raw: unknown): Announcement {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return emptyAnnouncement();
  const r = raw as Record<string, unknown>;
  const text = truncateChars(cleanLine(r.text), ANNOUNCEMENT_MAX_LENGTH);
  const translations: TranslationMap = {};
  for (const [lang, fields] of Object.entries(parseTranslations(r.translations))) {
    const value = truncateChars(cleanLine(fields?.text), ANNOUNCEMENT_MAX_LENGTH);
    if (value) translations[lang as keyof TranslationMap] = { text: value };
  }
  return {
    enabled: r.enabled === true,
    text,
    translations,
    starts_on: isValidDateString(r.starts_on) ? r.starts_on : null,
    ends_on: isValidDateString(r.ends_on) ? r.ends_on : null,
  };
}

/** Panelde kaydetmeden önce; hata varsa Türkçe mesaj. */
export function validateAnnouncement(value: Announcement): string | null {
  if (value.enabled && !cleanLine(value.text)) {
    return "Duyuruyu açmak için Türkçe metni yazın.";
  }
  if (cleanLine(value.text).length > ANNOUNCEMENT_MAX_LENGTH) {
    return `Duyuru metni en fazla ${ANNOUNCEMENT_MAX_LENGTH} karakter olabilir.`;
  }
  if (value.starts_on && !isValidDateString(value.starts_on)) return "Başlangıç tarihi geçersiz.";
  if (value.ends_on && !isValidDateString(value.ends_on)) return "Bitiş tarihi geçersiz.";
  if (value.starts_on && value.ends_on && value.ends_on < value.starts_on) {
    return "Bitiş tarihi başlangıçtan önce olamaz.";
  }
  return null;
}

/** DB'ye yazılacak değer. Boş (metin yok + kapalı) duyuru `{}` olur. */
export function announcementForSave(value: Announcement): Record<string, unknown> {
  const text = truncateChars(cleanLine(value.text), ANNOUNCEMENT_MAX_LENGTH);
  const translations = cleanTranslationsForSave(
    Object.fromEntries(
      Object.entries(value.translations).map(([lang, fields]) => [
        lang,
        { text: truncateChars(cleanLine(fields?.text), ANNOUNCEMENT_MAX_LENGTH) },
      ])
    ),
    { text: ANNOUNCEMENT_MAX_LENGTH }
  );
  if (!text && !value.enabled) return {};
  const out: Record<string, unknown> = { enabled: value.enabled === true, text };
  if (Object.keys(translations).length > 0) out.translations = translations;
  if (value.starts_on && isValidDateString(value.starts_on)) out.starts_on = value.starts_on;
  if (value.ends_on && isValidDateString(value.ends_on)) out.ends_on = value.ends_on;
  return out;
}

/** Açık mı, metni var mı ve bugün tarih aralığında mı? */
export function isAnnouncementLive(
  value: Announcement | null | undefined,
  now: Date,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): boolean {
  if (!value || !value.enabled || !value.text) return false;
  const today = localNow(now, timeZone).date;
  if (value.starts_on && today < value.starts_on) return false;
  if (value.ends_on && today > value.ends_on) return false;
  return true;
}

/** Müşterinin dilindeki metin; çeviri yoksa Türkçe. */
export function resolveAnnouncementText(value: Announcement, language: string): string {
  if (!isMenuLanguage(language) || language === "tr") return value.text;
  return translatedText({ translations: value.translations }, "text", language) ?? value.text;
}

/**
 * Müşteri menüsüne giden değer: yalnız AÇIK ve metni olan duyuru (tarihler istemcide, güncel saatle
 * değerlendirilir; CDN önbelleği gün dönümünde bayat kalmasın). Aksi halde null → yük küçük kalır.
 */
export function publicAnnouncement(raw: unknown): Announcement | null {
  const parsed = parseAnnouncement(raw);
  return parsed.enabled && parsed.text ? parsed : null;
}

/**
 * Kapatılan duyuru, içerik (metin/çeviri/tarih) değişince yeniden görünsün: içeriğe bağlı kısa anahtar.
 * `scope` (restoran slug'ı) farklı restoranların aynı metinli duyurularını birbirinden ayırır.
 * Dil değiştirmek anahtarı değiştirmez (müşteri kapattıysa dil değişince geri gelmez).
 */
export function announcementDismissKey(value: Announcement, scope = ""): string {
  let hash = 5381;
  const source = JSON.stringify([scope, value.text, value.translations, value.starts_on, value.ends_on]);
  for (let i = 0; i < source.length; i += 1) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  return `tm-ann-${hash.toString(36)}`;
}
