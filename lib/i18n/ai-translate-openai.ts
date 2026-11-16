/**
 * Faz 2.5b: menü metinlerini OpenAI ile çevirir (yalnız sunucu).
 * Anahtar yoksa / hata olursa { ok: false } döner; çağıran 503 verir, işletme elle çevirebilir.
 */
import OpenAI from "openai";
import { LANGUAGE_INFO, type TranslationLanguage } from "@/lib/i18n/languages";
import {
  lowerAllCapsFields,
  parseAiTranslateResponse,
  restoreAllCapsFields,
  type AiTranslateItem,
  type AiTranslateResults,
} from "@/lib/i18n/ai-translate-request";
import { TRANSLATABLE_KIND_INFO, TRANSLATABLE_KINDS } from "@/lib/i18n/translatable";

export const AI_TRANSLATE_MODEL = process.env.AI_TRANSLATE_MODEL?.trim() || "gpt-4.1-mini";
const AI_TRANSLATE_TIMEOUT_MS = 45_000;

/** İngilizce dil adı (istemde). */
const ENGLISH_LANGUAGE_NAME: Record<TranslationLanguage, string> = {
  en: "English",
  ru: "Russian",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  uk: "Ukrainian",
  zh: "Simplified Chinese",
  az: "Azerbaijani (Latin script)",
};

export function buildAiTranslateSystemPrompt(target: TranslationLanguage): string {
  const language = ENGLISH_LANGUAGE_NAME[target];
  const kinds = TRANSLATABLE_KINDS.map((kind) => `- ${kind}: ${TRANSLATABLE_KIND_INFO[kind].promptHint}`).join("\n");
  return `You translate restaurant and cafe menu content from Turkish into ${language} (${LANGUAGE_INFO[target].nativeName}).
The text is shown to restaurant guests on a digital QR menu.

Rules:
- Translate naturally, the way a good restaurant menu in ${language} would read. Use the usual menu terms for headings, not word-by-word translations (e.g. "Ara Sıcaklar" = hot appetizers, "Tatlılar" = desserts).
- Descriptive dish names ARE translated: "Mercimek Çorbası" = lentil soup, "Tavuk Şiş" = chicken shish, "Izgara Köfte" = grilled meatballs, "Sütlaç" = rice pudding.
- Only iconic Turkish dishes with no real equivalent keep their Turkish name: e.g. Lahmacun, İskender, Mantı, Künefe, Pide, Menemen, Baklava, Adana Kebap, Kokoreç.${target === "ru" || target === "uk" || target === "zh" ? `
- Write such kept names in the target script the way menus in ${language} do (e.g. Adana Kebap -> ${target === "zh" ? "阿达纳烤肉" : target === "uk" ? "Адана кебаб" : "Адана кебаб"}). Never leave Turkish Latin-script words in the output, except brand names.` : ""}
- Brand names (Coca-Cola, Nutella, Efes, Red Bull), proper names and place names stay as they are. A place name inside a dish name (Adana, Urfa, Bursa) is NOT translated as a separate sentence.
- Keep numbers, sizes, units exactly (33 cl, 500 g); "2 kişilik" = for 2 people.
- Do not add, remove or guess information. No quotes, emojis or notes.
- If a text is already in ${language} or is only a brand/code, return it unchanged.

Item kinds:
${kinds}

Input: JSON {"items":[{"id":"…","kind":"…","fields":{"name":"Turkish text", …}}]}
Output: JSON only, same ids and the same field keys, translated values:
{"items":[{"id":"…","fields":{"name":"…"}}]}`;
}

/**
 * Modele giden alan adları: "main_group" modelce bir kod/anahtar sanılıp çevrilmeden bırakılıyordu;
 * anlamlı bir adla gönderilir, yanıtta geri çevrilir.
 */
const MODEL_FIELD_ALIASES: Record<string, string> = { main_group: "section_heading" };
const FROM_MODEL_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_FIELD_ALIASES).map(([field, alias]) => [alias, field])
);

function toModelFields(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [MODEL_FIELD_ALIASES[k] ?? k, v]));
}

function fromModelResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return raw;
  return {
    items: items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const fields = (entry as { fields?: unknown }).fields;
      if (!fields || typeof fields !== "object" || Array.isArray(fields)) return entry;
      return {
        ...entry,
        fields: Object.fromEntries(
          Object.entries(fields as Record<string, unknown>).map(([k, v]) => [FROM_MODEL_FIELD[k] ?? k, v])
        ),
      };
    }),
  };
}

export function isAiTranslateConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key, timeout: AI_TRANSLATE_TIMEOUT_MS, maxRetries: 0 });
}

export type AiTranslateOutcome =
  | { ok: true; results: AiTranslateResults }
  | { ok: false; reason: "not_configured" | "failed" };

export async function translateMenuItemsWithOpenAI(
  target: TranslationLanguage,
  items: AiTranslateItem[]
): Promise<AiTranslateOutcome> {
  const client = getClient();
  if (!client) return { ok: false, reason: "not_configured" };
  const { items: prepared, caps } = lowerAllCapsFields(items);
  try {
    const completion = await client.chat.completions.create({
      model: AI_TRANSLATE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildAiTranslateSystemPrompt(target) },
        {
          role: "user",
          content: JSON.stringify({
            items: prepared.map((item) => ({ id: item.id, kind: item.kind, fields: toModelFields(item.fields) })),
          }),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { ok: false, reason: "failed" };
    const parsed = parseAiTranslateResponse(fromModelResponse(JSON.parse(raw) as unknown), prepared);
    return { ok: true, results: restoreAllCapsFields(parsed, caps, LANGUAGE_INFO[target].intl) };
  } catch (error) {
    console.warn("[ai-translate] OpenAI call failed:", error instanceof Error ? error.message : error);
    return { ok: false, reason: "failed" };
  }
}
