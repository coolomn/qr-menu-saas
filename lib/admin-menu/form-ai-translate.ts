/**
 * Faz 2.5b: formlardaki "Boşları AI ile çevir" için saf yardımcılar (istek kurma + sonucu forma işleme).
 */
import type { TranslationLanguage } from "@/lib/i18n/languages";
import type { TranslationMap } from "@/lib/i18n/translations";
import type { TranslatableKind } from "@/lib/i18n/translatable";
import type { AiTranslateResults } from "@/lib/i18n/ai-translate-request";
import {
  fillBlankTranslationFields,
  missingTranslationFields,
  type TranslationStatus,
} from "@/lib/i18n/edit-translations";

export type TranslatableEntity = {
  /** Formda benzersiz anahtar (ör. "product", "variant:2"). */
  id: string;
  kind: TranslatableKind;
  /** Türkçe kaynak alanlar. */
  source: Record<string, string | null | undefined>;
  translations: TranslationMap | null | undefined;
};

export type MissingJob = {
  language: TranslationLanguage;
  items: { id: string; kind: TranslatableKind; fields: Record<string, string> }[];
};

/** Her dil için TR'si dolu, çevirisi boş alanlar. Eksik yoksa boş liste. */
export function buildMissingTranslationJobs(
  entities: readonly TranslatableEntity[],
  languages: readonly TranslationLanguage[]
): MissingJob[] {
  const jobs: MissingJob[] = [];
  for (const language of languages) {
    const items: MissingJob["items"] = [];
    for (const entity of entities) {
      const missing = missingTranslationFields(entity.source, entity.translations, language);
      if (missing.length === 0) continue;
      const fields: Record<string, string> = {};
      for (const field of missing) fields[field] = String(entity.source[field] ?? "").trim();
      items.push({ id: entity.id, kind: entity.kind, fields });
    }
    if (items.length > 0) jobs.push({ language, items });
  }
  return jobs;
}

/** AI sonuçlarını bir öğenin haritasına işler; dolu alanlara (kullanıcının beklerken yazdıkları dahil) dokunmaz. */
export function applyAiResults(
  map: TranslationMap | null | undefined,
  results: Partial<Record<TranslationLanguage, AiTranslateResults>>,
  id: string
): TranslationMap {
  let next: TranslationMap = map ?? {};
  for (const [language, byId] of Object.entries(results) as [TranslationLanguage, AiTranslateResults][]) {
    const fields = byId?.[id];
    if (fields) next = fillBlankTranslationFields(next, language, fields);
  }
  return next;
}

/** Düğme altındaki kısa sonuç metni. */
export function aiFillMessage(translatedFields: number, error: string | null): string {
  if (error && translatedFields === 0) return error;
  if (error) return `${translatedFields} alan çevrildi; kalanlar için: ${error}`;
  if (translatedFields === 0) return "Çevrilecek boş alan bulunamadı.";
  return `${translatedFields} alan çevrildi. Kontrol edip kaydedin.`;
}

/** Birden çok öğenin bir dildeki toplam doluluk durumu (sekme noktası). */
export function entitiesTranslationStatus(
  entities: readonly Pick<TranslatableEntity, "source" | "translations">[],
  language: TranslationLanguage
): TranslationStatus {
  let required = 0;
  let missing = 0;
  for (const entity of entities) {
    for (const text of Object.values(entity.source)) {
      if (String(text ?? "").trim()) required += 1;
    }
    missing += missingTranslationFields(entity.source, entity.translations, language).length;
  }
  if (required === 0) return "none";
  if (missing === 0) return "full";
  if (missing === required) return "empty";
  return "partial";
}
