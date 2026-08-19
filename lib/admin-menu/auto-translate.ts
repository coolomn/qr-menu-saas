export type TargetLanguage = "en" | "ru";
export type SourceLanguage = "tr" | "en";

export type ProductTranslationFields = {
  name?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
};

/** Yalnızca hedef dil kolonları. TR/EN veya TR/RU karışmaz. */
export type ProductTranslationPatch = {
  name_en?: string;
  description_en?: string;
  name_ru?: string;
  description_ru?: string;
};

export type LocalizedFieldSource = {
  text: string;
  sourceLanguage: SourceLanguage;
};

export function isBlankTranslation(value: string | null | undefined): boolean {
  return !String(value ?? "").trim();
}

export function productTargetKeys(targetLanguage: TargetLanguage): {
  name: "name_en" | "name_ru";
  description: "description_en" | "description_ru";
} {
  if (targetLanguage === "en") {
    return { name: "name_en", description: "description_en" };
  }
  return { name: "name_ru", description: "description_ru" };
}

/**
 * Varsayılan kaynak TR. TR boş ve hedef RU ise EN kullanılabilir.
 * Kaynak metin asla overwrite edilmez (yalnızca okunur).
 */
export function pickTranslationSource(options: {
  tr: string | null | undefined;
  en: string | null | undefined;
  targetLanguage: TargetLanguage;
}): LocalizedFieldSource | null {
  const tr = String(options.tr ?? "").trim();
  const en = String(options.en ?? "").trim();
  if (tr) return { text: tr, sourceLanguage: "tr" };
  if (options.targetLanguage === "ru" && en) {
    return { text: en, sourceLanguage: "en" };
  }
  return null;
}

export function planMissingLocalizedField(
  tr: string | null | undefined,
  en: string | null | undefined,
  ru: string | null | undefined,
  targetLanguage: TargetLanguage
): LocalizedFieldSource | null {
  const current = targetLanguage === "en" ? en : ru;
  if (!isBlankTranslation(current)) return null;
  return pickTranslationSource({ tr, en, targetLanguage });
}

export function planProductMissingTranslations(
  product: ProductTranslationFields,
  targetLanguage: TargetLanguage
): { name: LocalizedFieldSource | null; description: LocalizedFieldSource | null } {
  return {
    name: planMissingLocalizedField(
      product.name,
      product.name_en,
      product.name_ru,
      targetLanguage
    ),
    description: planMissingLocalizedField(
      product.description,
      product.description_en,
      product.description_ru,
      targetLanguage
    ),
  };
}

export function buildProductTranslationPatch(
  targetLanguage: TargetLanguage,
  translations: { name?: string | null; description?: string | null }
): ProductTranslationPatch {
  const keys = productTargetKeys(targetLanguage);
  const patch: ProductTranslationPatch = {};
  const name = String(translations.name ?? "").trim();
  const description = String(translations.description ?? "").trim();
  if (name) patch[keys.name] = name;
  if (description) patch[keys.description] = description;
  return patch;
}

export function productTranslationPatchKeys(
  patch: ProductTranslationPatch
): string[] {
  return Object.keys(patch).sort();
}

export async function fillMissingProductTranslations(
  product: ProductTranslationFields,
  targetLanguage: TargetLanguage,
  translate: (
    text: string,
    sourceLanguage: SourceLanguage,
    targetLanguage: TargetLanguage
  ) => Promise<string | null>
): Promise<ProductTranslationPatch> {
  const plan = planProductMissingTranslations(product, targetLanguage);
  const translations: { name?: string; description?: string } = {};
  if (plan.name) {
    const text = await translate(plan.name.text, plan.name.sourceLanguage, targetLanguage);
    if (text?.trim()) translations.name = text.trim();
  }
  if (plan.description) {
    const text = await translate(
      plan.description.text,
      plan.description.sourceLanguage,
      targetLanguage
    );
    if (text?.trim()) translations.description = text.trim();
  }
  return buildProductTranslationPatch(targetLanguage, translations);
}

export async function fillMissingLocalizedValue(
  tr: string | null | undefined,
  en: string | null | undefined,
  ru: string | null | undefined,
  targetLanguage: TargetLanguage,
  translate: (
    text: string,
    sourceLanguage: SourceLanguage,
    targetLanguage: TargetLanguage
  ) => Promise<string | null>
): Promise<string | null> {
  const plan = planMissingLocalizedField(tr, en, ru, targetLanguage);
  if (!plan) return null;
  const text = await translate(plan.text, plan.sourceLanguage, targetLanguage);
  return text?.trim() || null;
}

export function translationStatusLabel(targetLanguage: TargetLanguage): string {
  return targetLanguage === "en" ? "İngilizce çevriliyor…" : "Rusça çevriliyor…";
}

export function translationActionLabel(targetLanguage: TargetLanguage): string {
  return targetLanguage === "en" ? "Eksik İngilizceleri Çevir" : "Eksik Rusçaları Çevir";
}
