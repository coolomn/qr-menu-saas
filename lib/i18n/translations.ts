/**
 * Faz 2.5: satır çevirileri. Kaynak sırası:
 *   1) row.translations[lang][field]  (yeni yapı)
 *   2) row[`${field}_${lang}`]         (geçiş dönemi: eski en/ru kolonları; migration yoksa da çalışır)
 *   3) row[field]                      (TR ana metin)
 */
import {
  isMenuLanguage,
  TRANSLATION_LANGUAGES,
  type MenuLanguage,
  type TranslationLanguage,
} from "@/lib/i18n/languages";

export type TranslationMap = Partial<Record<TranslationLanguage, Record<string, string>>>;

const TRANSLATION_LANGUAGE_SET = new Set<string>(TRANSLATION_LANGUAGES);

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Güvenilmeyen jsonb → temiz harita (bilinmeyen dil, metin olmayan değer, boş metin atılır). */
export function parseTranslations(raw: unknown): TranslationMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TranslationMap = {};
  for (const [lang, fields] of Object.entries(raw as Record<string, unknown>)) {
    if (!TRANSLATION_LANGUAGE_SET.has(lang)) continue;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) continue;
    const cleaned: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      const text = cleanString(value);
      if (text) cleaned[field] = text;
    }
    if (Object.keys(cleaned).length > 0) out[lang as TranslationLanguage] = cleaned;
  }
  return out;
}

type TranslatableRow = { translations?: unknown } & Record<string, unknown>;

/** Yalnız çeviri (TR'ye düşmez); yoksa null. */
export function translatedText(
  row: TranslatableRow | null | undefined,
  field: string,
  language: string
): string | null {
  if (!row || !isMenuLanguage(language) || language === "tr") return null;
  const map = row.translations;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    const fields = (map as Record<string, unknown>)[language];
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      const text = cleanString((fields as Record<string, unknown>)[field]);
      if (text) return text;
    }
  }
  if (language === "en" || language === "ru") {
    return cleanString(row[`${field}_${language}`]);
  }
  return null;
}

/** Çeviri yoksa TR ana metin (o da yoksa ""). */
export function localizedText(
  row: TranslatableRow | null | undefined,
  field: string,
  language: string
): string {
  const translated = translatedText(row, field, language);
  if (translated) return translated;
  const base = row?.[field];
  return typeof base === "string" ? base : "";
}

/** Eski en/ru kolonlarından harita kurar (translations kolonu olmayan şemalar için). */
export function translationsFromLegacyColumns(
  row: Record<string, unknown>,
  fields: readonly string[]
): TranslationMap {
  const out: TranslationMap = {};
  for (const lang of ["en", "ru"] as const) {
    const cleaned: Record<string, string> = {};
    for (const field of fields) {
      const text = cleanString(row[`${field}_${lang}`]);
      if (text) cleaned[field] = text;
    }
    if (Object.keys(cleaned).length > 0) out[lang] = cleaned;
  }
  return out;
}

/** Yeni yapı + eski kolonlar birleşik (yeni yapı önceliklidir). */
export function mergedTranslations(
  row: Record<string, unknown>,
  fields: readonly string[]
): TranslationMap {
  const legacy = translationsFromLegacyColumns(row, fields);
  const current = parseTranslations(row.translations);
  const out: TranslationMap = { ...legacy };
  for (const [lang, values] of Object.entries(current) as [TranslationLanguage, Record<string, string>][]) {
    out[lang] = { ...(out[lang] ?? {}), ...values };
  }
  return out;
}

/**
 * Müşteri menüsü JSON'u için: eski en/ru kolonlarıyla AYNI olan girdileri translations'tan atar
 * (geçiş döneminde iki kopya taşınmasın). Okuma tarafı (translatedText) iki kaynağa da baktığı
 * için sonuç değişmez. Boş kalırsa alan hiç eklenmez → eski menü JSON'u aynen kalır.
 */
export function withCompactTranslations<T extends Record<string, unknown>>(
  row: T,
  legacyFields: readonly string[]
): Omit<T, "translations"> & { translations?: TranslationMap } {
  const { translations: raw, ...rest } = row;
  const map = parseTranslations(raw);
  for (const lang of ["en", "ru"] as const) {
    const fields = map[lang];
    if (!fields) continue;
    for (const field of legacyFields) {
      if (fields[field] && fields[field] === cleanString(row[`${field}_${lang}`])) {
        delete fields[field];
      }
    }
    if (Object.keys(fields).length === 0) delete map[lang];
  }
  return Object.keys(map).length > 0 ? { ...rest, translations: map } : rest;
}

/** Sorguyu önce `translations` kolonuyla dener; kolon yoksa (migration uygulanmadı) onsuz tekrarlar. */
export async function selectWithOptionalTranslations<R extends { error: { code?: string; message?: string } | null }>(
  run: (translationsColumn: string) => PromiseLike<R>
): Promise<R> {
  const first = await run(",translations");
  if (first.error && isMissingColumnError(first.error)) {
    return run("");
  }
  return first;
}

export function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column|schema cache|does not exist/i.test(error.message || "");
}

export function hasTranslation(map: TranslationMap, language: MenuLanguage, field: string): boolean {
  if (language === "tr") return true;
  return Boolean(map[language]?.[field]);
}
