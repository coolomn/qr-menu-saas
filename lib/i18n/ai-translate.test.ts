import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_TRANSLATE_MAX_ITEMS,
  AI_TRANSLATE_MAX_SOURCE_CHARS,
  aiTranslateRequestSchema,
  chunkAiTranslateItems,
  compactAiTranslateItems,
  isAllCapsText,
  lowerAllCapsFields,
  parseAiTranslateResponse,
  restoreAllCapsFields,
  type AiTranslateItem,
} from "./ai-translate-request";
import { buildAiTranslateSystemPrompt } from "./ai-translate-openai";
import { applyAiResults, buildMissingTranslationJobs, entitiesTranslationStatus } from "@/lib/admin-menu/form-ai-translate";

const RID = "8b7a1c2e-4f5d-4a3b-9c8d-1e2f3a4b5c6d";

describe("istek şeması", () => {
  it("geçerli isteği kabul eder", () => {
    const ok = aiTranslateRequestSchema.safeParse({
      restaurantId: RID,
      targetLanguage: "de",
      items: [{ id: "product:1", kind: "product", fields: { name: "Mercimek Çorbası" } }],
    });
    assert.equal(ok.success, true);
  });

  it("TR hedef dili, bilinmeyen alanı, yinelenen kimliği ve fazla öğeyi reddeder", () => {
    const base = { restaurantId: RID, targetLanguage: "de" };
    const item = { id: "a", kind: "product", fields: { name: "x" } };
    assert.equal(aiTranslateRequestSchema.safeParse({ ...base, targetLanguage: "tr", items: [item] }).success, false);
    assert.equal(
      aiTranslateRequestSchema.safeParse({ ...base, items: [{ ...item, fields: { label: "x" } }] }).success,
      false
    );
    assert.equal(aiTranslateRequestSchema.safeParse({ ...base, items: [item, item] }).success, false);
    const many = Array.from({ length: AI_TRANSLATE_MAX_ITEMS + 1 }, (_, i) => ({ ...item, id: `i${i}` }));
    assert.equal(aiTranslateRequestSchema.safeParse({ ...base, items: many }).success, false);
  });

  it("toplam karakter sınırını uygular", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `i${i}`,
      kind: "product",
      fields: { description: "x".repeat(2000) },
    }));
    assert.ok(7 * 2000 > AI_TRANSLATE_MAX_SOURCE_CHARS);
    assert.equal(aiTranslateRequestSchema.safeParse({ restaurantId: RID, targetLanguage: "en", items }).success, false);
  });
});

describe("parçalama", () => {
  it("boş alanları atar ve sınırlara göre böler", () => {
    const compact = compactAiTranslateItems([
      { id: "a", kind: "product", fields: { name: " ", description: "" } },
      { id: "b", kind: "product", fields: { name: " Çorba " } },
    ]);
    assert.deepEqual(compact, [{ id: "b", kind: "product", fields: { name: "Çorba" } }]);

    const items: AiTranslateItem[] = Array.from({ length: 70 }, (_, i) => ({ id: `p${i}`, kind: "product", fields: { name: "Çorba" } }));
    const chunks = chunkAiTranslateItems(items);
    assert.deepEqual(chunks.map((c) => c.length), [30, 30, 10]);

    const big: AiTranslateItem[] = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      kind: "product",
      fields: { description: "y".repeat(5000) },
    }));
    for (const chunk of chunkAiTranslateItems(big)) {
      const chars = chunk.reduce((n, it) => n + Object.values(it.fields).join("").length, 0);
      assert.ok(chars <= AI_TRANSLATE_MAX_SOURCE_CHARS, "parça sınırı aşmaz");
      assert.ok(aiTranslateRequestSchema.safeParse({ restaurantId: RID, targetLanguage: "en", items: chunk }).success);
    }
  });
});

describe("model yanıtı", () => {
  const requested: AiTranslateItem[] = [
    { id: "p1", kind: "product", fields: { name: "Çorba" } },
    { id: "o1", kind: "modifier_option", fields: { name: "Ekstra peynir" } },
  ];

  it("yalnız istenen öğe/alanları, metin olarak ve sınır içinde alır", () => {
    const out = parseAiTranslateResponse(
      {
        items: [
          { id: "p1", fields: { name: "  Soup ", description: "uydurma" } },
          { id: "o1", fields: { name: "x".repeat(200) } },
          { id: "zz", fields: { name: "?" } },
          { id: "p1", fields: { name: 5 } },
        ],
      },
      requested
    );
    assert.deepEqual(out.p1, { name: "Soup" });
    assert.equal(out.o1.name.length, 80);
    assert.equal(out.zz, undefined);
  });

  it("bozuk yanıtta boş döner", () => {
    assert.deepEqual(parseAiTranslateResponse(null, requested), {});
    assert.deepEqual(parseAiTranslateResponse({ items: "x" }, requested), {});
  });

  it("istem hedef dili ve özel ad kuralını içerir", () => {
    const prompt = buildAiTranslateSystemPrompt("de");
    assert.match(prompt, /German/);
    assert.match(prompt, /Lahmacun/);
  });
});

describe("form AI yardımcıları", () => {
  const entities = [
    { id: "product", kind: "product" as const, source: { name: "Çorba", description: "" }, translations: { en: { name: "Soup" } } },
    { id: "variant:0", kind: "variant" as const, source: { label: "Büyük" }, translations: {} },
  ];

  it("dil başına yalnız eksik alanları ister", () => {
    const jobs = buildMissingTranslationJobs(entities, ["en", "de"]);
    assert.deepEqual(jobs, [
      { language: "en", items: [{ id: "variant:0", kind: "variant", fields: { label: "Büyük" } }] },
      {
        language: "de",
        items: [
          { id: "product", kind: "product", fields: { name: "Çorba" } },
          { id: "variant:0", kind: "variant", fields: { label: "Büyük" } },
        ],
      },
    ]);
  });

  it("sonucu işlerken kullanıcının yazdığını ezmez", () => {
    const map = applyAiResults({ de: { name: "Meine Suppe" } }, { de: { product: { name: "Suppe" } }, en: { product: { name: "Soup" } } }, "product");
    assert.deepEqual(map, { de: { name: "Meine Suppe" }, en: { name: "Soup" } });
  });

  it("toplu durum", () => {
    assert.equal(entitiesTranslationStatus(entities, "en"), "partial");
    assert.equal(entitiesTranslationStatus(entities, "de"), "empty");
  });
});

describe("büyük harfli başlıklar", () => {
  it("tamamen büyük harfli metni tanır", () => {
    assert.equal(isAllCapsText("YİYECEKLER"), true);
    assert.equal(isAllCapsText("Çorba"), false);
    assert.equal(isAllCapsText("33 CL"), true);
    assert.equal(isAllCapsText("A"), false);
    assert.equal(isAllCapsText("123"), false);
  });

  it("küçültüp gönderir, sonucu hedef dilde büyütür", () => {
    const { items, caps } = lowerAllCapsFields([
      { id: "c1", kind: "category", fields: { name: "Çorbalar", main_group: "İÇECEKLER" } },
    ]);
    assert.deepEqual(items[0].fields, { name: "Çorbalar", main_group: "içecekler" });
    const out = restoreAllCapsFields({ c1: { name: "Soups", main_group: "Getränke" } }, caps, "de-DE");
    assert.deepEqual(out, { c1: { name: "Soups", main_group: "GETRÄNKE" } });
  });
});
