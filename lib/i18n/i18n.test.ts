import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MENU_LANGUAGES,
  LANGUAGE_INFO,
  MENU_LANGUAGES,
  intlLocale,
  normalizeMenuLanguages,
  pickInitialMenuLanguage,
  pickLang,
} from "./languages";
import {
  localizedText,
  mergedTranslations,
  parseTranslations,
  selectWithOptionalTranslations,
  translatedText,
  withCompactTranslations,
} from "./translations";
import { menuLabelFallback } from "./menu-label-fallback";
import { resolveAllergen } from "@/lib/public-menu/allergens";

describe("languages", () => {
  it("has 10 languages with info, TR first", () => {
    assert.equal(MENU_LANGUAGES.length, 10);
    assert.equal(MENU_LANGUAGES[0], "tr");
    for (const lang of MENU_LANGUAGES) assert.ok(LANGUAGE_INFO[lang].nativeName);
  });

  it("normalizes restaurant languages: tr first, unknown/duplicate dropped, default when missing", () => {
    assert.deepEqual(normalizeMenuLanguages(null), DEFAULT_MENU_LANGUAGES);
    assert.deepEqual(normalizeMenuLanguages(undefined), ["tr", "en", "ru"]);
    assert.deepEqual(normalizeMenuLanguages(["de", "en", "xx", "de", "tr"]), ["tr", "de", "en"]);
    assert.deepEqual(normalizeMenuLanguages([]), ["tr"]);
  });

  it("picks initial language: url > stored > browser > tr, only among enabled", () => {
    const enabled = ["tr", "en", "de"] as const;
    assert.equal(pickInitialMenuLanguage(enabled, { urlLang: "de", storedLang: "en" }), "de");
    assert.equal(pickInitialMenuLanguage(enabled, { urlLang: "ru", storedLang: "en" }), "en");
    assert.equal(
      pickInitialMenuLanguage(enabled, { browserLanguages: ["fr-FR", "de-AT", "en"] }),
      "de"
    );
    assert.equal(pickInitialMenuLanguage(enabled, { browserLanguages: ["zh-Hans-CN"] }), "tr");
    assert.equal(pickInitialMenuLanguage(["tr", "zh"], { browserLanguages: ["zh-Hans-CN"] }), "zh");
  });

  it("pickLang falls back to TR for unknown codes; intl locale per language", () => {
    const text = {
      tr: "a", en: "b", ru: "c", de: "d", fr: "e", es: "f", it: "g", uk: "h", zh: "i", az: "j",
    };
    assert.equal(pickLang("de", text), "d");
    assert.equal(pickLang("xx", text), "a");
    assert.equal(intlLocale("uk"), "uk-UA");
    assert.equal(intlLocale("??"), "tr-TR");
  });
});

describe("translations", () => {
  const product = {
    name: "Mercimek Çorbası",
    name_en: "Lentil soup",
    name_ru: null,
    description: "Günün çorbası",
    translations: { en: { name: "Lentil Soup" }, de: { name: "Linsensuppe" }, xx: { name: "?" } },
  };

  it("prefers translations, then legacy en/ru column, else null", () => {
    assert.equal(translatedText(product, "name", "en"), "Lentil Soup");
    assert.equal(translatedText(product, "name", "de"), "Linsensuppe");
    assert.equal(translatedText(product, "name", "ru"), null);
    assert.equal(translatedText(product, "name", "tr"), null);
    assert.equal(translatedText({ name: "x", name_ru: " Суп " }, "name", "ru"), "Суп");
  });

  it("localizedText falls back to Turkish base text", () => {
    assert.equal(localizedText(product, "description", "de"), "Günün çorbası");
    assert.equal(localizedText(product, "name", "fr"), "Mercimek Çorbası");
  });

  it("parseTranslations drops unknown languages, non-strings and blanks", () => {
    assert.deepEqual(
      parseTranslations({ de: { name: " Suppe ", note: 3, x: "" }, xx: { name: "?" }, tr: { name: "a" }, fr: "bad" }),
      { de: { name: "Suppe" } }
    );
    assert.deepEqual(parseTranslations(null), {});
    assert.deepEqual(parseTranslations([]), {});
  });

  it("compacts entries duplicated in legacy columns (payload size) without changing results", () => {
    const row = {
      name: "Çay",
      name_en: "Tea",
      name_ru: "Чай",
      translations: { en: { name: "Tea" }, ru: { name: "Чай" }, de: { name: "Tee" } },
    };
    const compact = withCompactTranslations(row, ["name"]);
    assert.deepEqual(compact.translations, { de: { name: "Tee" } });
    for (const lang of ["en", "ru", "de"]) {
      assert.equal(translatedText(compact, "name", lang), translatedText(row, "name", lang));
    }
    const onlyLegacy = withCompactTranslations({ name: "Su", name_en: "Water", translations: { en: { name: "Water" } } }, ["name"]);
    assert.equal("translations" in onlyLegacy, false);
  });

  it("mergedTranslations combines legacy columns with the new map (new wins)", () => {
    assert.deepEqual(
      mergedTranslations({ name_en: "Old", name_ru: "Рус", translations: { en: { name: "New" } } }, ["name"]),
      { en: { name: "New" }, ru: { name: "Рус" } }
    );
  });

  it("retries a query without the translations column when the column is missing", async () => {
    const calls: string[] = [];
    const result = await selectWithOptionalTranslations(async (col) => {
      calls.push(col);
      return col
        ? { data: null, error: { code: "42703", message: 'column "translations" does not exist' } }
        : { data: [1], error: null };
    });
    assert.deepEqual(calls, [",translations", ""]);
    assert.deepEqual(result.data, [1]);

    const other = await selectWithOptionalTranslations(async () => ({ data: null, error: { code: "500", message: "boom" } }));
    assert.equal(other.error?.message, "boom");
  });
});

describe("menu label fallback + allergens", () => {
  it("translates common Turkish group names in all languages", () => {
    assert.equal(menuLabelFallback("İçecekler", "de"), "Getränke");
    assert.equal(menuLabelFallback("  tatlılar ", "zh"), "甜点");
    assert.equal(menuLabelFallback("İçecekler", "tr"), null);
    assert.equal(menuLabelFallback("Özel Seçki", "en"), null);
  });

  it("resolves allergen labels for new languages and falls back to TR for unknown codes", () => {
    assert.equal(resolveAllergen("gluten", "it")?.label, "Glutine");
    assert.equal(resolveAllergen("süt", "de")?.label, "Milch");
    assert.equal(resolveAllergen("milk", "xx")?.label, "Süt");
  });
});
