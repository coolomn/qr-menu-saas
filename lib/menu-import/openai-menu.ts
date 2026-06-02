import OpenAI from "openai";
import { parseJsonFromModelContent } from "./parse-json";
import {
  enforceProductLimit,
  importMenuPayloadSchema,
  MENU_IMPORT_EMPTY_RESULT_MESSAGE,
  type ImportMenuPayload,
  type ImportProduct,
} from "./schema";

/** Vision + JSON çıktısı için üst sınır (8192 yavaşlatıyordu). */
const IMPORT_COMPLETION_MAX_TOKENS = 3000;
const IMPORT_VISION_MODEL = "gpt-4o-mini";

const MENU_JSON_INSTRUCTION = `Yanıt YALNIZCA geçerli JSON (markdown yok):
{"categories":[{"name":"string","main_group":"YİYECEKLER|İÇECEKLER|DİĞER|null","products":[{"name":"string","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null}]}]}

Kurallar:
- Bölüm başlığı altındaki yemek/fiyat satırları → tek kategori; ürünler products içinde. Her yemeği ayrı kategori yapma.
- Yalnızca menüde görünen satırlar; uydurma ürün/kategori ekleme.
- description / description_en / description_ru yalnızca menüde açıkça yazılıysa; yoksa null. Açıklama icat etme.
- TR ad→name; EN kısa yemek adı→name_en (description değil); RU→name_ru; fiyat→price.
- Çok dilli menüde çeviri üretme; okunan metni kullan.
- En az 1 kategori ve 1 ürün. Başlık belirsizse kategori "Genel", main_group "DİĞER" veya null.`;

const ENRICH_DESCRIPTION_RULES = `Yalnızca description, description_en, description_ru güncelle; name/fiyat/sıra aynı. Menüde yoksa null; uydurma.`;

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY tanımlı değil.");
  return new OpenAI({ apiKey: key });
}

function roughlySameStructure(a: ImportMenuPayload, b: ImportMenuPayload): boolean {
  if (a.categories.length !== b.categories.length) return false;
  for (let ci = 0; ci < a.categories.length; ci++) {
    const ac = a.categories[ci];
    const bc = b.categories[ci];
    if (ac.products.length !== bc.products.length) return false;
    if (ac.name.trim() !== bc.name.trim()) return false;
    for (let pi = 0; pi < ac.products.length; pi++) {
      if (ac.products[pi].name.trim() !== bc.products[pi].name.trim()) return false;
    }
  }
  return true;
}

function mergeDescriptionField(
  base: string | null | undefined,
  enriched: string | null | undefined
): string | null {
  const fromEnriched = enriched?.trim() || null;
  const fromBase = base?.trim() || null;
  return fromEnriched || fromBase || null;
}

function mergeDescriptionsOnly(base: ImportMenuPayload, enriched: ImportMenuPayload): ImportMenuPayload {
  if (!roughlySameStructure(base, enriched)) return base;
  const categories = base.categories.map((c, ci) => ({
    ...c,
    products: c.products.map((p, pi) => {
      const q = enriched.categories[ci]?.products[pi];
      return mergeProductDescriptions(p, q);
    }),
  }));
  return { categories };
}

function mergeProductDescriptions(base: ImportProduct, enriched?: ImportProduct): ImportProduct {
  if (!enriched) return base;
  return {
    ...base,
    description: mergeDescriptionField(base.description, enriched.description),
    description_en: mergeDescriptionField(base.description_en, enriched.description_en),
    description_ru: mergeDescriptionField(base.description_ru, enriched.description_ru),
  };
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
    return "Menü verisi eksik veya hatalı. Daha net bir PDF veya menü görseli yükleyin.";
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

async function enrichDescriptionsFromText(
  menuText: string,
  draft: ImportMenuPayload
): Promise<ImportMenuPayload> {
  const openai = getClient();
  const draftJson = JSON.stringify(draft, null, 0);
  const completion = await openai.chat.completions.create({
    model: IMPORT_VISION_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: IMPORT_COMPLETION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `Menü metninden yalnızca açıklama alanlarını doldur. Çıktı aynı JSON şeması (markdown yok).\n${ENRICH_DESCRIPTION_RULES}`,
      },
      {
        role: "user",
        content: `METİN:\n---\n${menuText}\n---\n\nJSON:\n${draftJson}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  const enriched = await parseMenuJsonResponse(raw);
  return mergeDescriptionsOnly(draft, enriched);
}

export async function structureMenuFromText(menuText: string): Promise<ImportMenuPayload> {
  const openai = getClient();
  const completion = await openai.chat.completions.create({
    model: IMPORT_VISION_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: IMPORT_COMPLETION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `Menü metnini JSON'a çevir.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: menuText,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  let payload = await parseMenuJsonResponse(raw);

  const trimmed = menuText.trim();
  if (trimmed.length >= 80) {
    try {
      payload = await enrichDescriptionsFromText(trimmed, payload);
    } catch (e) {
      console.warn("[menu-import] enrichDescriptionsFromText atlandı:", e);
    }
  }

  return payload;
}

export async function structureMenuFromImageBase64(
  mime: string,
  base64: string
): Promise<ImportMenuPayload> {
  const openai = getClient();
  const dataUrl = `data:${mime};base64,${base64}`;
  const completion = await openai.chat.completions.create({
    model: IMPORT_VISION_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: IMPORT_COMPLETION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `Menü görselini oku; tek geçişte JSON üret.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Görseldeki menüyü JSON şemasına çıkar. Sadece görünen metin; açıklama yoksa null.",
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "low" },
          },
        ],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  return parseMenuJsonResponse(raw);
}
