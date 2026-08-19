import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fillMissingCategoryName,
  lookupMenuCategoryTranslation,
  MENU_CATEGORY_TRANSLATE_CONTEXT,
  translateCategoryTitle,
  type MenuCategoryFallbackRequest,
} from "./menu-category-translations";

describe("menu category dictionary", () => {
  it("maps common Turkish category titles to menu English headings", () => {
    assert.equal(lookupMenuCategoryTranslation("Tatlı", "en"), "Desserts");
    assert.equal(lookupMenuCategoryTranslation("Tatlılar", "en"), "Desserts");
    assert.equal(lookupMenuCategoryTranslation("İçecekler", "en"), "Drinks");
    assert.equal(lookupMenuCategoryTranslation("Ana Yemekler", "en"), "Main Courses");
    assert.equal(lookupMenuCategoryTranslation("Ara Sıcaklar", "en"), "Hot Appetizers");
    assert.equal(lookupMenuCategoryTranslation("Deniz Ürünleri", "en"), "Seafood");
  });

  it("maps the same titles to Russian menu headings", () => {
    assert.equal(lookupMenuCategoryTranslation("Tatlı", "ru"), "Десерты");
    assert.equal(lookupMenuCategoryTranslation("Tatlılar", "ru"), "Десерты");
    assert.equal(lookupMenuCategoryTranslation("İçecekler", "ru"), "Напитки");
    assert.equal(lookupMenuCategoryTranslation("Ana Yemekler", "ru"), "Основные блюда");
    assert.equal(lookupMenuCategoryTranslation("Ara Sıcaklar", "ru"), "Горячие закуски");
    assert.equal(lookupMenuCategoryTranslation("Deniz Ürünleri", "ru"), "Морепродукты");
  });

  it("normalizes whitespace, case, and punctuation", () => {
    assert.equal(lookupMenuCategoryTranslation("  TATLI!  ", "en"), "Desserts");
    assert.equal(lookupMenuCategoryTranslation("ana   yemekler.", "en"), "Main Courses");
  });
});

describe("translateCategoryTitle fallback", () => {
  it("calls the fallback translator with restaurant-menu context when unknown", async () => {
    const seen: MenuCategoryFallbackRequest[] = [];
    const result = await translateCategoryTitle(
      "Chef's Table",
      "tr",
      "en",
      async (request) => {
        seen.push(request);
        return "Chef's Table";
      }
    );
    assert.equal(result, "Chef's Table");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].text, "Chef's Table");
    assert.equal(seen[0].targetLanguage, "en");
    assert.equal(seen[0].context, MENU_CATEGORY_TRANSLATE_CONTEXT);
    assert.match(seen[0].context, /restaurant menu category title/i);
    assert.match(seen[0].context, /Return only the translated category title/i);
  });

  it("does not call fallback for dictionary hits", async () => {
    let called = 0;
    const result = await translateCategoryTitle("Tatlı", "tr", "en", async () => {
      called += 1;
      return "Sweet";
    });
    assert.equal(result, "Desserts");
    assert.equal(called, 0);
  });
});

describe("fillMissingCategoryName", () => {
  it("does not overwrite filled name_en or name_ru", async () => {
    const enPatch = await fillMissingCategoryName(
      { name: "Tatlı", name_en: "House Sweets", name_ru: "" },
      "en",
      async () => "Desserts"
    );
    assert.deepEqual(enPatch, {});

    const ruPatch = await fillMissingCategoryName(
      { name: "Tatlı", name_en: "Desserts", name_ru: "Сладости" },
      "ru",
      async () => "Десерты"
    );
    assert.deepEqual(ruPatch, {});
  });

  it("fills only the target language column", async () => {
    const ruPatch = await fillMissingCategoryName(
      { name: "Tatlı", name_en: "Desserts", name_ru: "" },
      "ru",
      async () => "Sweet"
    );
    assert.deepEqual(ruPatch, { name_ru: "Десерты" });
    assert.equal("name_en" in ruPatch, false);
  });
});
