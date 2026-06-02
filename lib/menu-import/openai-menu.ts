import OpenAI from "openai";
import { parseJsonFromModelContent } from "./parse-json";
import {
  enforceProductLimit,
  importMenuPayloadSchema,
  MENU_IMPORT_EMPTY_RESULT_MESSAGE,
  type ImportMenuPayload,
} from "./schema";

const IMPORT_COMPLETION_MAX_TOKENS = 6000;
/** Görsel OCR doğruluğu için tam vision modeli. */
const IMPORT_IMAGE_MODEL = "gpt-4o";
const IMPORT_TEXT_MODEL = "gpt-4o-mini";

const STRICT_OCR_RULES = `KESİN OCR KURALLARI (ihlal etme):
- Menüde görünmeyen ürün adı üretme.
- Tahmin yapma.
- Genelleştirme yapma (ör. birkaç omlet satırı görünce tek "Omlet" veya "Kahvaltı Tabağı" yazma).
- OCR ile net okunmayan satırı yazma; emin değilsen o ürünü atla.
- Kategori adını yalnızca menüde yazılı bölüm başlığından al; uydurma kategori yazma.
- Eksik ürün bırakmak, uydurma ürün eklemekten iyidir.`;

const DESCRIPTION_RULES = `Açıklama (description / description_en / description_ru):
- Menüde ürün adının altında veya yanında gerçekten yazılı açıklama/cümle varsa ilgili dildeki alana yaz (ör. "Bazlama bread with acuka sauce…" → description_en).
- Menüde açıklama yoksa null; ürün adından, fiyattan veya tahminden açıklama üretme; içerik/tarif uydurma.
- Kısa ikinci dil yemek adı (1–6 kelime, "Plain Omelette") → name_en; description DEĞİL.
- "Sade Omlet / Plain Omelette" gibi yalnızca isim satırı → name + name_en; description null.
- İngilizce adı description veya description_en'e yazma; name_en kullan.`;

const MENU_JSON_INSTRUCTION = `Yanıt YALNIZCA geçerli JSON (markdown yok):
{"categories":[{"name":"string","name_en":null,"name_ru":null,"main_group":"YİYECEKLER|İÇECEKLER|DİĞER|null","products":[{"name":"string","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null|string}]}]}

${STRICT_OCR_RULES}

Kategori başlıkları (bölüm adları):
- Tek satırda Türkçe + İngilizce birlikte yazılıysa (ör. "KAHVALTI Breakfast", "MEZELER Appetizers", "ANA YEMEKLER Main Dishes") → name yalnızca Türkçe kısım (okunan metinden; mümkünse normal yazım: Kahvaltı, Mezeler); name_en yalnızca İngilizce kısım (Breakfast, Appetizers). İngilizce kısmı name içine ekleme.
- Tek dilli kategori başlığında name_en ve name_ru null.
- Rusça kategori başlığı varsa name_ru; yoksa null.

Ürün satırları:
- Bölüm başlığı altındaki yemek/fiyat satırları → tek kategori; her satır ayrı ürün. Her yemeği ayrı kategori yapma.
- Ürün: TR ad→name; net okunan EN kısa yemek adı→name_en; RU→name_ru.
- price: menüde görünen fiyat; yoksa null.
- Çeviri veya yorum üretme; yalnızca okunan metin.
${DESCRIPTION_RULES}`;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY tanımlı değil.");
  return new OpenAI({ apiKey: key });
}

function hasNonEmptyCategories(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("categories" in value)) {
    return false;
  }
  const categories = (value as { categories?: unknown }).categories;
  return Array.isArray(categories) && categories.length > 0;
}

function formatImportValidationError(parsed: unknown, zodMessage: string): string {
  if (!hasNonEmptyCategories(parsed)) {
    return MENU_IMPORT_EMPTY_RESULT_MESSAGE;
  }
  const lower = zodMessage.toLowerCase();
  if (lower.includes("categories") && lower.includes("too_small")) {
    return MENU_IMPORT_EMPTY_RESULT_MESSAGE;
  }
  if (lower.includes("too_small") || lower.includes("invalid_type")) {
    return "Menü verisi eksik veya hatalı. Daha net bir menü görseli yükleyin.";
  }
  return "Menü verisi doğrulanamadı. Lütfen dosyayı kontrol edip tekrar deneyin.";
}

async function parseMenuJsonResponse(raw: string | null | undefined): Promise<ImportMenuPayload> {
  if (!raw) throw new Error("AI yanıtı boş.");
  let parsed: unknown;
  try {
    parsed = parseJsonFromModelContent(raw);
  } catch {
    throw new Error("AI çıktısı JSON olarak çözülemedi.");
  }

  if (!hasNonEmptyCategories(parsed)) {
    console.warn("[menu-import] AI returned no categories:", parsed);
    throw new Error(MENU_IMPORT_EMPTY_RESULT_MESSAGE);
  }

  const validated = importMenuPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn("[menu-import] Zod validation failed:", validated.error.flatten());
    throw new Error(formatImportValidationError(parsed, validated.error.message));
  }

  try {
    return enforceProductLimit(validated.data);
  } catch (e) {
    if (e instanceof Error && e.message === MENU_IMPORT_EMPTY_RESULT_MESSAGE) {
      console.warn("[menu-import] No valid products after filtering:", validated.data);
    }
    throw e;
  }
}

export async function structureMenuFromText(menuText: string): Promise<ImportMenuPayload> {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: IMPORT_TEXT_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: IMPORT_COMPLETION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `Menü metnini JSON'a çevir; yalnızca metinde yazanları al.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: menuText,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  return parseMenuJsonResponse(raw);
}

export async function structureMenuFromImageBase64(
  mime: string,
  base64: string
): Promise<ImportMenuPayload> {
  const openai = getClient();
  const dataUrl = `data:${mime};base64,${base64}`;
  const completion = await openai.chat.completions.create({
    model: IMPORT_IMAGE_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: IMPORT_COMPLETION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `Sen menü OCR asistanısın. Görseldeki yazıları harfiyen oku; tek geçişte JSON üret.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Bu menü fotoğrafındaki yazıları harfiyen oku. Ürün adları, fiyatlar ve menüde görünen açıklama cümlelerini ilgili alanlara yaz. Tahmin etme; emin olmadığın satırı atla. Açıklama menüde yoksa null.",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "auto" },
          },
        ],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  return parseMenuJsonResponse(raw);
}
