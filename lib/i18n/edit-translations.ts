/**
 * Faz 2.5b: paneldeki çeviri düzenleme yardımcıları (saf fonksiyonlar).
 *
 * Form durumu tüm dilleri taşır (menüde kapalı diller de korunur); kayıtta temizlenmiş harita
 * `translations` kolonuna yazılır, DB tetikleyicisi eski _en/_ru kolonlarını eşitler.
 */
import {
  TRANSLATION_LANGUAGES,
  type MenuLanguage,
  type TranslationLanguage,
} from "@/lib/i18n/languages";
import { mergedTranslations, parseTranslations, type TranslationMap } from "@/lib/i18n/translations";

const TRANSLATION_LANGUAGE_SET = new Set<string>(TRANSLATION_LANGUAGES);

/** Menüde açık diller → panelde çeviri sekmesi gösterilecek diller (TR hariç, sabit sırada). */
export function translationTabsFor(menuLanguages: readonly MenuLanguage[]): TranslationLanguage[] {
  const enabled = new Set<string>(menuLanguages);
  return TRANSLATION_LANGUAGES.filter((lang) => enabled.has(lang));
}

export function getTranslationField(
  map: TranslationMap | null | undefined,
  language: TranslationLanguage,
  field: string
): string {
  return map?.[language]?.[field] ?? "";
}

/**
 * Yazarken kullanılır: değer kırpılmaz (imleç zıplamasın), yalnız tamamen boşsa alan silinir.
 * Değişmeyen diller aynı nesne olarak kalır.
 */
export function setTranslationField(
  map: TranslationMap | null | undefined,
  language: TranslationLanguage,
  field: string,
  value: string
): TranslationMap {
  const next: TranslationMap = { ...(map ?? {}) };
  const fields = { ...(next[language] ?? {}) };
  if (value.trim() === "") {
    delete fields[field];
  } else {
    fields[field] = value;
  }
  if (Object.keys(fields).length > 0) next[language] = fields;
  else delete next[language];
  return next;
}

/** Birden çok alanı tek seferde yazar (AI sonucu); dolu alanları EZMEZ. */
export function fillBlankTranslationFields(
  map: TranslationMap | null | undefined,
  language: TranslationLanguage,
  values: Record<string, string>
): TranslationMap {
  let next: TranslationMap = { ...(map ?? {}) };
  for (const [field, value] of Object.entries(values)) {
    if (!value?.trim()) continue;
    if (getTranslationField(next, language, field).trim()) continue;
    next = setTranslationField(next, language, field, value.trim());
  }
  return next;
}

/**
 * Kayıt öncesi: bilinmeyen dil/alan atılır, metinler kırpılır ve sınırlanır, boşlar atılır.
 * maxLength alan başına (verilmeyen alan atılır).
 */
export function cleanTranslationsForSave(
  map: TranslationMap | null | undefined,
  maxLength: Record<string, number>
): TranslationMap {
  const out: TranslationMap = {};
  for (const [lang, fields] of Object.entries(parseTranslations(map ?? {}))) {
    if (!TRANSLATION_LANGUAGE_SET.has(lang) || !fields) continue;
    const kept: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields)) {
      const max = maxLength[field];
      if (!max) continue;
      const text = value.trim().slice(0, max).trim();
      if (text) kept[field] = text;
    }
    if (Object.keys(kept).length > 0) out[lang as TranslationLanguage] = kept;
  }
  return out;
}

/**
 * Eski en/ru kolon değerleri (yalnız tetikleyicisi olmayan jsonb öğeler için: malzemeler).
 * Ör. fields ["name"] → { name_en: "…" | null, name_ru: "…" | null }.
 */
export function legacyColumnsFromTranslations(
  map: TranslationMap,
  fields: readonly string[]
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const field of fields) {
    out[`${field}_en`] = map.en?.[field] ?? null;
    out[`${field}_ru`] = map.ru?.[field] ?? null;
  }
  return out;
}

/** DB satırı → form haritası (yeni yapı + eski en/ru kolonları birleşik). */
export function translationsFromRow(
  row: Record<string, unknown> | null | undefined,
  fields: readonly string[]
): TranslationMap {
  if (!row) return {};
  return mergedTranslations(row, fields);
}

/** TR metni dolu olup bu dilde çevirisi boş olan alanlar. */
export function missingTranslationFields(
  source: Record<string, string | null | undefined>,
  map: TranslationMap | null | undefined,
  language: TranslationLanguage
): string[] {
  const out: string[] = [];
  for (const [field, text] of Object.entries(source)) {
    if (!String(text ?? "").trim()) continue;
    if (getTranslationField(map, language, field).trim()) continue;
    out.push(field);
  }
  return out;
}

export type TranslationStatus = "full" | "partial" | "empty" | "none";

/** Sekme rozeti: TR'de dolu alanların bu dilde ne kadarı çevrilmiş. "none" = çevrilecek metin yok. */
export function translationStatus(
  source: Record<string, string | null | undefined>,
  map: TranslationMap | null | undefined,
  language: TranslationLanguage
): TranslationStatus {
  const required = Object.entries(source).filter(([, text]) => String(text ?? "").trim());
  if (required.length === 0) return "none";
  const missing = missingTranslationFields(source, map, language).length;
  if (missing === 0) return "full";
  if (missing === required.length) return "empty";
  return "partial";
}

/**
 * `target` haritasındaki tek bir alanı `source`'takiyle değiştirir (source'ta yoksa alan silinir).
 * Ör. alt kategori ana grup çevirisini üst kategoriden alır; çeviri merkezinde ortak ana grup.
 */
export function withFieldFrom(target: TranslationMap, source: TranslationMap, field: string): TranslationMap {
  const out: TranslationMap = {};
  const languages = new Set([...Object.keys(target), ...Object.keys(source)]) as Set<TranslationLanguage>;
  for (const lang of languages) {
    const fields = { ...(target[lang] ?? {}) };
    delete fields[field];
    const fromSource = source[lang]?.[field];
    if (fromSource) fields[field] = fromSource;
    if (Object.keys(fields).length > 0) out[lang] = fields;
  }
  return out;
}

/** Yalnız verilen alanları tutar (ör. kategori satırından ana grubu ayırmak için). */
export function pickTranslationFields(map: TranslationMap, fields: readonly string[]): TranslationMap {
  const out: TranslationMap = {};
  for (const [lang, values] of Object.entries(map) as [TranslationLanguage, Record<string, string>][]) {
    const kept: Record<string, string> = {};
    for (const field of fields) if (values?.[field]) kept[field] = values[field];
    if (Object.keys(kept).length > 0) out[lang] = kept;
  }
  return out;
}

/** Aynı metni paylaşan öğelerin çevirilerini birleştirir: her dil+alan için ilk dolu değer. */
export function firstFilledTranslations(maps: readonly TranslationMap[]): TranslationMap {
  let out: TranslationMap = {};
  for (const map of maps) {
    for (const [lang, values] of Object.entries(map) as [TranslationLanguage, Record<string, string>][]) {
      out = fillBlankTranslationFields(out, lang, values ?? {});
    }
  }
  return out;
}
