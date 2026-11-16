/**
 * Faz 2.5b: /api/admin/translate istek/yanıt sözleşmesi (istemci + sunucu ortak, saf).
 * Bir istek = tek hedef dil + en çok AI_TRANSLATE_MAX_ITEMS öğe. Kaynak her zaman Türkçe.
 */
import { z } from "zod";
import { TRANSLATION_LANGUAGES, type TranslationLanguage } from "@/lib/i18n/languages";
import {
  TRANSLATABLE_KINDS,
  TRANSLATABLE_KIND_INFO,
  fieldMaxLength,
  type TranslatableKind,
} from "@/lib/i18n/translatable";

export const AI_TRANSLATE_MAX_ITEMS = 30;
/** İstek başına toplam kaynak karakter (istem + yanıt süresini ve maliyeti sınırlar). */
export const AI_TRANSLATE_MAX_SOURCE_CHARS = 12000;
/** Tek kaynak alanın en çok uzunluğu (ürün açıklaması sınırı). */
export const AI_TRANSLATE_MAX_FIELD_CHARS = 2000;

export type AiTranslateItem = {
  /** İstemcinin verdiği anahtar (ör. "product:<uuid>"); yanıtta aynen döner. */
  id: string;
  kind: TranslatableKind;
  /** Türkçe kaynak metinler (yalnız çevrilmesi istenen alanlar). */
  fields: Record<string, string>;
};

export type AiTranslateRequest = {
  restaurantId: string;
  targetLanguage: TranslationLanguage;
  items: AiTranslateItem[];
};

/** id → alan → çeviri. Çevrilemeyen öğe/alan yanıtta yer almaz. */
export type AiTranslateResults = Record<string, Record<string, string>>;

const itemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  kind: z.enum(TRANSLATABLE_KINDS),
  fields: z.record(z.string(), z.string().max(AI_TRANSLATE_MAX_FIELD_CHARS)),
});

export const aiTranslateRequestSchema = z
  .object({
    restaurantId: z.string().uuid(),
    targetLanguage: z.enum(TRANSLATION_LANGUAGES as [TranslationLanguage, ...TranslationLanguage[]]),
    items: z.array(itemSchema).min(1).max(AI_TRANSLATE_MAX_ITEMS),
  })
  .superRefine((data, ctx) => {
    let total = 0;
    const ids = new Set<string>();
    for (const item of data.items) {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: "custom", message: "Yinelenen öğe." });
        return;
      }
      ids.add(item.id);
      const allowed = TRANSLATABLE_KIND_INFO[item.kind].fields;
      const entries = Object.entries(item.fields);
      if (entries.length === 0) {
        ctx.addIssue({ code: "custom", message: "Boş öğe." });
        return;
      }
      for (const [field, text] of entries) {
        if (!allowed.includes(field)) {
          ctx.addIssue({ code: "custom", message: "Geçersiz alan." });
          return;
        }
        total += text.length;
      }
    }
    if (total > AI_TRANSLATE_MAX_SOURCE_CHARS) {
      ctx.addIssue({ code: "custom", message: "İstek çok büyük." });
    }
  });

/** Boş kaynak alanları atar; hiç alanı kalmayan öğeyi çıkarır. */
export function compactAiTranslateItems(items: AiTranslateItem[]): AiTranslateItem[] {
  const out: AiTranslateItem[] = [];
  for (const item of items) {
    const fields: Record<string, string> = {};
    for (const [field, text] of Object.entries(item.fields)) {
      const trimmed = (text ?? "").trim();
      if (trimmed) fields[field] = trimmed;
    }
    if (Object.keys(fields).length > 0) out.push({ ...item, fields });
  }
  return out;
}

function sourceChars(item: AiTranslateItem): number {
  return Object.values(item.fields).reduce((sum, text) => sum + text.length, 0);
}

/**
 * Öğeleri istek sınırlarına göre parçalar (sıra korunur). Alan sınırından uzun kaynak metin
 * gönderilmez (kırpılmış metnin çevirisi "tam" çeviri gibi kaydedilmesin); elle çevrilmeli.
 */
export function chunkAiTranslateItems(items: AiTranslateItem[]): AiTranslateItem[][] {
  const chunks: AiTranslateItem[][] = [];
  let current: AiTranslateItem[] = [];
  let chars = 0;
  for (const raw of items) {
    const fields: Record<string, string> = {};
    for (const [field, text] of Object.entries(raw.fields)) {
      if (text.length <= AI_TRANSLATE_MAX_FIELD_CHARS) fields[field] = text;
    }
    if (Object.keys(fields).length === 0) continue;
    const item = { ...raw, fields };
    const size = sourceChars(item);
    if (
      current.length > 0 &&
      (current.length >= AI_TRANSLATE_MAX_ITEMS || chars + size > AI_TRANSLATE_MAX_SOURCE_CHARS)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Model yanıtını güvenle okur: yalnız istenen öğe + alanlar, metin, sınır içinde.
 * Beklenen biçim: {"items":[{"id":"…","fields":{"name":"…"}}]}
 */
export function parseAiTranslateResponse(raw: unknown, requested: AiTranslateItem[]): AiTranslateResults {
  const byId = new Map(requested.map((item) => [item.id, item]));
  const out: AiTranslateResults = {};
  if (!raw || typeof raw !== "object") return out;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return out;
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    const fields = (entry as { fields?: unknown }).fields;
    if (typeof id !== "string" || !fields || typeof fields !== "object" || Array.isArray(fields)) continue;
    const source = byId.get(id);
    if (!source) continue;
    const kept: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      if (!Object.hasOwn(source.fields, field) || typeof value !== "string") continue;
      const max = fieldMaxLength(source.kind, field);
      const text = value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max).trim();
      if (text) kept[field] = text;
    }
    if (Object.keys(kept).length > 0) out[id] = { ...(out[id] ?? {}), ...kept };
  }
  return out;
}

/** "YİYECEKLER" gibi tamamen büyük harfli (en az 2 harf) metin. */
export function isAllCapsText(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && text === text.toLocaleUpperCase("tr-TR") && text !== text.toLocaleLowerCase("tr-TR");
}

/**
 * Modeller büyük harfli başlıkları çoğu zaman "kod" sanıp çevirmeden döndürüyor.
 * Bu yüzden büyük harfli alanlar küçük harfe çevrilip gönderilir, sonuç hedef dilde yeniden büyütülür.
 */
export function lowerAllCapsFields(items: AiTranslateItem[]): { items: AiTranslateItem[]; caps: Set<string> } {
  const caps = new Set<string>();
  const out = items.map((item) => {
    const fields: Record<string, string> = {};
    for (const [field, text] of Object.entries(item.fields)) {
      if (isAllCapsText(text)) {
        caps.add(`${item.id}\u0000${field}`);
        fields[field] = text.toLocaleLowerCase("tr-TR");
      } else {
        fields[field] = text;
      }
    }
    return { ...item, fields };
  });
  return { items: out, caps };
}

export function restoreAllCapsFields(results: AiTranslateResults, caps: Set<string>, locale: string): AiTranslateResults {
  if (caps.size === 0) return results;
  const out: AiTranslateResults = {};
  for (const [id, fields] of Object.entries(results)) {
    out[id] = {};
    for (const [field, text] of Object.entries(fields)) {
      out[id][field] = caps.has(`${id}\u0000${field}`) ? text.toLocaleUpperCase(locale) : text;
    }
  }
  return out;
}
