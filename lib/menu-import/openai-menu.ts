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

const MATRIX_VARIANT_RULES = `KOLON MATRİSİ — ZORUNLU (rakı/şarap/ölçü tabloları):
- Bir kategori bloğunun üst satırında ölçü/hacim kolon başlıkları varsa (ör. 20 CL, 35 CL, 50 CL, 70 CL) → bu başlıklar o kategorideki HER ürün satırı için variants[].label değeridir.
- Düzen: sol sütun = ürün adı (name); üst satır = kolon başlıkları (variant label); hücreler = fiyat.
- Aynı kolon başlıkları kategorideki tüm ürün satırlarına uygulanır: Yeni Rakı, Yeni Rakı Yeni Seri, Tekirdağ Rakısı… hepsi aynı label setini alır.
- Fiyat hücresi boş, çizgi (____), tire, nokta veya OCR ile okunamıyorsa → variants[].price = null; YİNE DE variants[] oluştur. Fiyat olmadığı için variants atma.
- Kolon başlığı görünen matriste her ürün satırında variants zorunlu; variants olmadan product bırakma.
- Varyant label uydurma; yalnızca menüde görünen kolon başlıklarını kullan.
- Farklı ürün adları ayrı product kalır (birleştirme yok).

Menü düzeni örneği:
RAKILAR
          20 CL   35 CL   50 CL   70 CL
Yeni Rakı   ____   ____   ____   ____

JSON çıktısı (Yeni Rakı):
{"name":"Yeni Rakı","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null,"variants":[{"label":"20 CL","label_en":null,"label_ru":null,"price":null},{"label":"35 CL","label_en":null,"label_ru":null,"price":null},{"label":"50 CL","label_en":null,"label_ru":null,"price":null},{"label":"70 CL","label_en":null,"label_ru":null,"price":null}]}`;

const VARIANT_RULES = `Ürün varyantları (variants) — genel:
- Önce yukarıdaki KOLON MATRİSİ kurallarını kontrol et; üst satırda kolon başlıkları varsa matris modundasın.
- Matris modunda: her ürün satırı → variants[] (kolon sayısı kadar); product.price = null.
- Matris dışında: aynı ürün adı altında 2+ boyut/hacim/porsiyon ve ayrı fiyat → tek product + variants[].
- Small/Medium/Large, Küçük/Orta/Büyük, Kadeh/Şişe, ml/L/cl gibi görünen ölçü etiketleri variant label.
- Farklı yemek adları ayrı ürün kalır (ör. Sade Omlet, Kaşarlı Omlet, Mantarlı Omlet → 3 ayrı product).
- Farklı marka/çeşit adları ayrı product kalır (Yeni Rakı ≠ Tekirdağ Rakısı).
- Kolon başlığı veya ölçü etiketi menüde görünmüyorsa varyant label uydurma; tek ürün/tek fiyat bırak.
- Menüde fiyat yoksa variants[].price null olabilir.
- Tek fiyatlı (matris olmayan) ürünlerde variants ekleme.`;

const VARIANT_JSON_EXAMPLES = `JSON örnekleri (yalnızca format; menüde olmayanı yazma):

Rakı matrisi — fiyatlar okunmuş:
{"name":"Yeni Rakı","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null,"variants":[{"label":"20 CL","label_en":null,"label_ru":null,"price":"450"},{"label":"35 CL","label_en":null,"label_ru":null,"price":"650"},{"label":"50 CL","label_en":null,"label_ru":null,"price":"850"},{"label":"70 CL","label_en":null,"label_ru":null,"price":"1100"}]}

Rakı matrisi — fiyatlar boş/çizgi (variants yine zorunlu):
{"name":"Yeni Rakı Yeni Seri","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null,"variants":[{"label":"20 CL","label_en":null,"label_ru":null,"price":null},{"label":"35 CL","label_en":null,"label_ru":null,"price":null},{"label":"50 CL","label_en":null,"label_ru":null,"price":null},{"label":"70 CL","label_en":null,"label_ru":null,"price":null}]}

Pizza boyutları:
{"name":"Margarita Pizza","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null,"variants":[{"label":"Küçük","label_en":"Small","label_ru":null,"price":"280"},{"label":"Orta","label_en":"Medium","label_ru":null,"price":"350"},{"label":"Büyük","label_en":"Large","label_ru":null,"price":"420"}]}

Tek fiyat (matris yok):
{"name":"Izgara Köfte","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":"320"}`;

const DESCRIPTION_RULES = `Açıklama (description / description_en / description_ru):
- Menüde ürün adının altında veya yanında gerçekten yazılı açıklama/cümle varsa ilgili dildeki alana yaz (ör. "Bazlama bread with acuka sauce…" → description_en).
- Menüde açıklama yoksa null; ürün adından, fiyattan veya tahminden açıklama üretme; içerik/tarif uydurma.
- Kısa ikinci dil yemek adı (1–6 kelime, "Plain Omelette") → name_en; description DEĞİL.
- "Sade Omlet / Plain Omelette" gibi yalnızca isim satırı → name + name_en; description null.
- İngilizce adı description veya description_en'e yazma; name_en kullan.`;

const MENU_JSON_INSTRUCTION = `Yanıt YALNIZCA geçerli JSON (markdown yok):
{"categories":[{"name":"string","name_en":null,"name_ru":null,"main_group":"YİYECEKLER|İÇECEKLER|DİĞER|null","products":[{"name":"string","name_en":null,"name_ru":null,"description":null,"description_en":null,"description_ru":null,"price":null|string,"variants":[{"label":"string","label_en":null,"label_ru":null,"price":null|string}]}]}]}

${STRICT_OCR_RULES}

Kategori başlıkları (bölüm adları):
- Tek satırda Türkçe + İngilizce birlikte yazılıysa (ör. "KAHVALTI Breakfast", "MEZELER Appetizers", "ANA YEMEKLER Main Dishes") → name yalnızca Türkçe kısım (okunan metinden; mümkünse normal yazım: Kahvaltı, Mezeler); name_en yalnızca İngilizce kısım (Breakfast, Appetizers). İngilizce kısmı name içine ekleme.
- Tek dilli kategori başlığında name_en ve name_ru null.
- Rusça kategori başlığı varsa name_ru; yoksa null.

Ürün satırları:
- Bölüm başlığı altındaki satırlar → tek kategori; her yemeği ayrı kategori yapma.
- Farklı ürün/yemek adları → ayrı product (her satır ayrı ürün).
- Ürün adı sol sütunda, üstte kolon başlıkları varsa → matris modu; her satır için variants[] zorunlu (KOLON MATRİSİ kuralları).
- Ürün: TR ad→name; net okunan EN kısa yemek adı→name_en; RU→name_ru.
- Tek fiyatlı ürün (matris yok): price menüde görünen fiyat; yoksa null; variants ekleme.
- Çeviri veya yorum üretme; yalnızca okunan metin.
${MATRIX_VARIANT_RULES}
${VARIANT_RULES}
${VARIANT_JSON_EXAMPLES}
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
            text: "Bu menü fotoğrafındaki yazıları harfiyen oku. Ürün adları, fiyatlar ve menüde görünen açıklama cümlelerini ilgili alanlara yaz. Bir kategoride üst satırda ölçü/hacim kolonları (20 CL, 35 CL, 50 CL, 70 CL vb.) varsa o kategorideki her ürün satırı için variants[] oluştur; fiyat boş çizgi veya okunamazsa variants[].price null bırak. Tahmin etme; emin olmadığın ürün satırını atla. Açıklama menüde yoksa null.",
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
