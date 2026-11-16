import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanTranslationsForSave,
  fillBlankTranslationFields,
  firstFilledTranslations,
  getTranslationField,
  legacyColumnsFromTranslations,
  missingTranslationFields,
  pickTranslationFields,
  setTranslationField,
  translationStatus,
  translationTabsFor,
  translationsFromRow,
  withFieldFrom,
} from "./edit-translations";

describe("translationTabsFor", () => {
  it("TR'yi atar, sabit dil sırasını korur", () => {
    assert.deepEqual(translationTabsFor(["tr", "de", "en"]), ["en", "de"]);
    assert.deepEqual(translationTabsFor(["tr"]), []);
  });
});

describe("setTranslationField", () => {
  it("yazarken kırpmaz, tamamen boşsa alanı ve boş dili siler", () => {
    let map = setTranslationField({}, "de", "name", "Suppe ");
    assert.equal(getTranslationField(map, "de", "name"), "Suppe ");
    map = setTranslationField(map, "de", "name", "  ");
    assert.deepEqual(map, {});
  });

  it("diğer dillere ve alanlara dokunmaz", () => {
    const map = setTranslationField({ en: { name: "Soup", description: "Hot" } }, "en", "name", "");
    assert.deepEqual(map, { en: { description: "Hot" } });
  });
});

describe("fillBlankTranslationFields", () => {
  it("dolu alanı ezmez, boşu doldurur", () => {
    const map = fillBlankTranslationFields({ en: { name: "My soup" } }, "en", { name: "Soup", description: "Hot" });
    assert.deepEqual(map, { en: { name: "My soup", description: "Hot" } });
  });
});

describe("cleanTranslationsForSave", () => {
  it("bilinmeyen dil/alanı atar, kırpar, sınırlar", () => {
    const map = cleanTranslationsForSave(
      { en: { name: "  Soup  ", junk: "x" }, de: { name: "abcdef" }, ar: { name: "حساء" } } as never,
      { name: 3 }
    );
    assert.deepEqual(map, { en: { name: "Sou" }, de: { name: "abc" } });
  });
});

describe("legacy kolonlar ve satırdan okuma", () => {
  it("translations'tan en/ru kolon değerlerini üretir", () => {
    assert.deepEqual(legacyColumnsFromTranslations({ en: { name: "Onion" }, de: { name: "Zwiebel" } }, ["name"]), {
      name_en: "Onion",
      name_ru: null,
    });
  });

  it("satırda translations eski kolondan önceliklidir", () => {
    assert.deepEqual(
      translationsFromRow({ name_en: "Old", name_ru: "Лук", translations: { en: { name: "New" }, de: { name: "Neu" } } }, ["name"]),
      { en: { name: "New" }, ru: { name: "Лук" }, de: { name: "Neu" } }
    );
  });
});

describe("eksik/durum", () => {
  it("yalnız TR'si dolu ve çevirisi boş alanları listeler", () => {
    const source = { name: "Çorba", description: "" };
    assert.deepEqual(missingTranslationFields(source, {}, "en"), ["name"]);
    assert.deepEqual(missingTranslationFields(source, { en: { name: "Soup" } }, "en"), []);
  });

  it("durum: full / partial / empty / none", () => {
    const source = { name: "Çorba", description: "Sıcak" };
    assert.equal(translationStatus(source, { en: { name: "Soup", description: "Hot" } }, "en"), "full");
    assert.equal(translationStatus(source, { en: { name: "Soup" } }, "en"), "partial");
    assert.equal(translationStatus(source, {}, "en"), "empty");
    assert.equal(translationStatus({ name: "" }, {}, "en"), "none");
  });
});

describe("alan birleştirme", () => {
  it("withFieldFrom tek alanı kaynaktan alır, kaynakta yoksa siler", () => {
    const out = withFieldFrom(
      { en: { name: "Burger", main_group: "Old" }, de: { main_group: "Alt" } },
      { en: { main_group: "FOODS" } },
      "main_group"
    );
    assert.deepEqual(out, { en: { name: "Burger", main_group: "FOODS" } });
  });

  it("pickTranslationFields yalnız istenen alanları tutar", () => {
    assert.deepEqual(pickTranslationFields({ en: { name: "A", main_group: "B" }, de: { main_group: "C" } }, ["name"]), {
      en: { name: "A" },
    });
  });

  it("firstFilledTranslations her dil+alan için ilk dolu değeri alır", () => {
    assert.deepEqual(firstFilledTranslations([{ en: { name: "Onion" } }, { en: { name: "Red onion" }, de: { name: "Zwiebel" } }]), {
      en: { name: "Onion" },
      de: { name: "Zwiebel" },
    });
  });
});
