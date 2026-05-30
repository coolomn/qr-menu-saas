import OpenAI from "openai";
import { parseJsonFromModelContent } from "./parse-json";
import {
  enforceProductLimit,
  importMenuPayloadSchema,
  MENU_IMPORT_EMPTY_RESULT_MESSAGE,
  type ImportMenuPayload,
  type ImportProduct,
} from "./schema";

const MULTILINGUAL_FIELD_RULES = `Çok dilli ürün alanları (ZORUNLU):
- Aynı ürün için menüde birden fazla dilde satır varsa satırı DİLİNE göre ayır; çeviri üretme, menüde yazanı kullan.
- Türkçe ürün adı → name
- İngilizce ürün adı → name_en (ASLA description'a yazma)
- Rusça ürün adı → name_ru
- Türkçe açıklama → description (yoksa null)
- İngilizce açıklama → description_en (yoksa null; ASLA description'a yazma)
- Rusça açıklama → description_ru
- Fiyat (₺, TL, sayı) yalnızca price; name veya description alanlarına yazma.

İsim vs açıklama:
- Kısa satır (genelde 1–6 kelime), başlık/yemek adı gibi → ilgili dilde name / name_en / name_ru
- Ürün adının hemen altındaki satır İngilizce/Rusça YEMEK ADI ise → name_en veya name_ru; description DEĞİL
- Malzeme, pişirme, "içindekiler", uzun cümle → ilgili dilde description / description_en / description_ru
- Türkçe kaynak satırdan Türkçe alanlar; İngilizce kaynak satırdan İngilizce alanlar; karıştırma

Sadece İngilizce menü:
- name zorunlu: menüdeki İngilizce ürün adını name'e yaz
- name_en de aynı İngilizce ad ile doldurulabilir
- Otomatik Türkçe çeviri uydurma; description null kalabilir

Tek dilli Türkçe menü (eski davranış):
- Yalnızca name, description, price kullan; name_en/name_ru/description_en/description_ru null bırak`;

const CATEGORY_VS_PRODUCT_RULES = `Kategori vs ürün ayrımı (ZORUNLU):
- Menüde belirgin bir bölüm başlığı (ör. "Türk Mutfağı", "Izgara", "Salatalar") varsa ve altında yemek adları/fiyatları listeleniyorsa, başlık TEK bir kategori olmalı; altındaki her satır o kategorinin products dizisine eklenmeli.
- Yemek adı/fiyat satırlarını ayrı kategori olarak yazma; her ürünü kendi kategorisi yapma.
- Aynı bölüm başlığı altındaki tüm ürünler tek categories[] girişinde birleşmeli.`;

/** Açıklamalar: parantez, küçük punto; çok dilli isim satırı hariç */
const DESCRIPTION_RULES = `Açıklama (description / description_en / description_ru) kuralları:
- Yalnızca gerçek açıklayıcı metinleri ilgili dildeki description alanına yaz.
- Ürün adının altındaki İngilizce/Rusça kısa yemek adı satırı description DEĞİL; name_en veya name_ru'dur.
- Türkçe açıklayıcı alt satır, parantez, italik, "İçindekiler:" → description (Türkçe).
- Menüde o dilde açıklama yoksa o alan null; uydurma yazma.
- Fiyat description alanlarına karışmamalı.`;

const PRODUCT_JSON_FIELDS = `{
          "name": "string (Türkçe veya birincil ürün adı, zorunlu)",
          "name_en": "string veya null",
          "name_ru": "string veya null",
          "description": "string veya null (Türkçe açıklama)",
          "description_en": "string veya null",
          "description_ru": "string veya null",
          "price": "string veya null (ör. 120 veya 120 ₺)"
        }`;

const MENU_JSON_INSTRUCTION = `Çıktı YALNIZCA geçerli bir JSON nesnesi olmalı (markdown yok). Şema:
{
  "categories": [
    {
      "name": "string (kategori adı, Türkçe)",
      "main_group": "string veya null (ör. YİYECEKLER, İÇECEKLER, DİĞER — bilinmiyorsa null)",
      "products": [
        ${PRODUCT_JSON_FIELDS}
      ]
    }
  ]
}

Örnek (çok dilli — doğru):
{
  "categories": [
    {
      "name": "Izgara",
      "main_group": "YİYECEKLER",
      "products": [
        {
          "name": "Izgara köfte",
          "name_en": "Grilled meatballs",
          "name_ru": null,
          "description": "Domates soslu pilav ile servis edilir.",
          "description_en": "Served with rice and tomato sauce.",
          "description_ru": null,
          "price": "320"
        }
      ]
    }
  ]
}

Örnek (yalnızca Türkçe):
{
  "categories": [
    {
      "name": "Çorbalar",
      "main_group": "YİYECEKLER",
      "products": [
        {
          "name": "Mercimek",
          "name_en": null,
          "name_ru": null,
          "description": "Günün çorbası.",
          "description_en": null,
          "description_ru": null,
          "price": "95"
        }
      ]
    }
  ]
}

YANLIŞ örnek (yapma): name="Izgara köfte", description="Grilled meatballs" — İngilizce ad name_en olmalı.

Genel kurallar:
- categories dizisi en az 1 kategori içermeli.
- Menüde okunabilir en az bir ürün/yemek/içecek satırı varsa mutlaka bir kategoriye yaz.
- Bölüm başlığı net değilse kategori adı "Genel" (main_group: "DİĞER" veya null).
- Yalnızca menüde görünen ürünleri yaz; uydurma ekleme.
- Fiyat yoksa null; ilgili dilde açıklama yoksa o alan null.
${CATEGORY_VS_PRODUCT_RULES}
${MULTILINGUAL_FIELD_RULES}
${DESCRIPTION_RULES}`;

const ENRICH_DESCRIPTION_RULES = `Zenginleştirme geçişi — yalnızca açıklama alanları:
- Güncellenebilir: description, description_en, description_ru
- DEĞİŞMEZ: name, name_en, name_ru, price, kategori adları, ürün sırası
- İngilizce kısa yemek adını description veya description_en'e yazma
${DESCRIPTION_RULES}`;

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

/** İkinci geçiş: yapı aynı; yalnızca description alanları birleştirilir */
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

/** Ham metin + taslak JSON ile açıklamaları zenginleştir (PDF / metin menü) */
async function enrichDescriptionsFromText(
  menuText: string,
  draft: ImportMenuPayload
): Promise<ImportMenuPayload> {
  const openai = getClient();
  const draftJson = JSON.stringify(draft, null, 0);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `Sen menü metni hizalayıcısısın. Ham menü metnini kullanarak verilen JSON'daki ürünlerin açıklama alanlarını (description, description_en, description_ru) doldur veya iyileştir.
Çıktı aynı JSON şemasında olmalı (markdown yok).
${ENRICH_DESCRIPTION_RULES}
Ham metinde bir dilde açıklama yoksa o alan null kalır.`,
      },
      {
        role: "user",
        content: `HAM MENÜ METNİ:\n---\n${menuText}\n---\n\nMEVCUT JSON (isim ve fiyatları koru, yalnızca açıklamaları doldur):\n${draftJson}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  const enriched = await parseMenuJsonResponse(raw);
  return mergeDescriptionsOnly(draft, enriched);
}

/** Görsel + taslak JSON ile açıklamaları zenginleştir */
async function enrichDescriptionsFromImage(
  mime: string,
  base64: string,
  draft: ImportMenuPayload
): Promise<ImportMenuPayload> {
  const openai = getClient();
  const dataUrl = `data:${mime};base64,${base64}`;
  const draftJson = JSON.stringify(draft, null, 0);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `Sen menü görüntüsü hizalayıcısısın. Görseldeki menüyü tekrar incele.
Verilen JSON'daki name, name_en, name_ru, fiyatlar ve sıra AYNI kalacak; yalnızca description, description_en, description_ru doldurulur veya iyileştirilir.
Çıktı aynı JSON şemasında olmalı (markdown yok).
${ENRICH_DESCRIPTION_RULES}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Aynı menü görseli. MEVCUT JSON — isimleri ve fiyatları koru, yalnızca açıklama alanlarını görselden tamamla:\n${draftJson}`,
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
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
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `Sen bir menü veri asistanısın. Metindeki tüm satırları dikkatle oku; çok dilli menülerde her satırı doğru dile ve alana yerleştir.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: `Aşağıdaki menü metnini yapılandır:\n\n${menuText}`,
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
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `Sen bir menü görüntüsü okuyucususun. Görseldeki yazıları oku; çok dilli bloklarda isim ve açıklama satırlarını doğru alanlara ayır.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Bu görseldeki menüyü JSON şemasına göre çıkar. Her dildeki açıklayıcı metinleri ilgili description alanına yaz; yabancı dildeki kısa yemek adlarını name_en/name_ru'ya yaz.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  let payload = await parseMenuJsonResponse(raw);

  try {
    payload = await enrichDescriptionsFromImage(mime, base64, payload);
  } catch (e) {
    console.warn("[menu-import] enrichDescriptionsFromImage atlandı:", e);
  }

  return payload;
}
