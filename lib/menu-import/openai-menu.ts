import OpenAI from "openai";
import { parseJsonFromModelContent } from "./parse-json";
import {
  enforceProductLimit,
  importMenuPayloadSchema,
  type ImportMenuPayload,
} from "./schema";

/** Açıklamalar: alt satır, parantez, küçük punto, italik, madde işareti alt maddeler */
const DESCRIPTION_RULES = `Açıklama (description) kuralları — çok önemli:
- Menüde ürün adının ALTINDA, daha küçük puntoyla veya italik / parantez içinde yazılan cümleleri mutlaka o ürünün "description" alanına yaz.
- Ürün adıyla aynı satırda tire veya parantezle devam eden kısa açıklamayı da description'a dahil et (ör. "Mercimek çorbası (günün çorbası)" → name uygun şekilde bölünebilir veya tamamı name'de kalan açıklama kısmı description).
- "İçindekiler:", "Sos:", "Yanında:" gibi alt satırlar ilgili ürünün description'ıdır.
- Menüde gerçekten açıklama yoksa o ürün için description: null bırak; uydurma metin yazma.`;

const MENU_JSON_INSTRUCTION = `Çıktı YALNIZCA geçerli bir JSON nesnesi olmalı (markdown yok). Şema:
{
  "categories": [
    {
      "name": "string (kategori adı, Türkçe)",
      "main_group": "string veya null (ör. YİYECEKLER, İÇECEKLER, DİĞER — bilinmiyorsa null)",
      "products": [
        { "name": "string", "description": "string veya null", "price": "string veya null (ör. 120 veya 120 ₺)" }
      ]
    }
  ]
}

Örnek (açıklama dolu):
{
  "categories": [
    {
      "name": "Çorbalar",
      "main_group": "YİYECEKLER",
      "products": [
        {
          "name": "İşkembe",
          "description": "Tereyağında kavrulmuş sarımsak ve sirke ile.",
          "price": "185"
        },
        {
          "name": "Mercimek",
          "description": "Günün çorbası. Yanında limon.",
          "price": null
        }
      ]
    }
  ]
}

Genel kurallar: Gerçek menüdeki yemek/içecek isimlerini kullan; uydurma kategori ekleme. Fiyat yoksa null.
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

/** İkinci geçiş: yapı aynı kabul edilerek yalnızca description birleştirilir */
function mergeDescriptionsOnly(base: ImportMenuPayload, enriched: ImportMenuPayload): ImportMenuPayload {
  if (!roughlySameStructure(base, enriched)) return base;
  const categories = base.categories.map((c, ci) => ({
    ...c,
    products: c.products.map((p, pi) => {
      const q = enriched.categories[ci]?.products[pi];
      const fromEnriched = q?.description?.trim() || null;
      const fromBase = p.description?.trim() || null;
      const desc = fromEnriched || fromBase || null;
      return { ...p, description: desc };
    }),
  }));
  return { categories };
}

async function parseMenuJsonResponse(raw: string | null | undefined): Promise<ImportMenuPayload> {
  if (!raw) throw new Error("AI yanıtı boş.");
  let parsed: unknown;
  try {
    parsed = parseJsonFromModelContent(raw);
  } catch {
    throw new Error("AI çıktısı JSON olarak çözülemedi.");
  }
  const validated = importMenuPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`AI çıktısı doğrulanamadı: ${validated.error.message}`);
  }
  return enforceProductLimit(validated.data);
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
        content: `Sen menü metni hizalayıcısısın. Görev: Aşağıdaki ham menü metnini kullanarak verilen JSON'daki ürünlerin "description" alanlarını doldur veya iyileştir.
Kategori adları, ürün adları, fiyatlar ve ürün sırası DEĞİŞMEZ; yalnızca description güncellenir.
Çıktı aynı JSON şemasında olmalı (markdown yok).
${DESCRIPTION_RULES}
Eğer ham metinde bir ürün için açıklama yoksa description null kalır.`,
      },
      {
        role: "user",
        content: `HAM MENÜ METNİ:\n---\n${menuText}\n---\n\nMEVCUT JSON (yapıyı koru, description doldur):\n${draftJson}`,
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
Verilen JSON'daki kategori adları, ürün adları, fiyatlar ve sıra AYNI kalacak; yalnızca her ürün için görselde okuyabildiğin "description" alanlarını doldur veya iyileştir.
Çıktı aynı JSON şemasında olmalı (markdown yok).
${DESCRIPTION_RULES}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Aynı menü görseli. MEVCUT JSON — yapıyı koru, sadece description'ları görselden tamamla:\n${draftJson}`,
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
        content: `Sen bir menü veri asistanısın. Metindeki tüm satırları dikkatle oku; ürün adı ile fiyat arasındaki veya alt satırdaki açıklayıcı metinleri kaçırma.\n${MENU_JSON_INSTRUCTION}`,
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
        content: `Sen bir menü görüntüsü okuyucususun. Görseldeki tüm yazıları dikkatle oku: ürün adının altındaki veya yanındaki küçük punto, italik veya parantez içi açıklamaları mutlaka yakala.\n${MENU_JSON_INSTRUCTION}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Bu görseldeki menüyü JSON şemasına göre çıkar. Her ürün için menüde görünen açıklayıcı alt metin varsa description alanına yaz.",
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
