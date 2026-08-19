import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProductTranslationPatch,
  fillMissingProductTranslations,
  planProductMissingTranslations,
  productTranslationPatchKeys,
} from "./auto-translate";

const productA = {
  name: "Mercimek Çorbası",
  name_en: "Lentil Soup",
  name_ru: "",
  description: "Geleneksel çorba",
  description_en: "Traditional soup",
  description_ru: "",
};

const productB = {
  name: "Mercimek Çorbası",
  name_en: "",
  name_ru: "Чечевичный суп",
  description: "Geleneksel çorba",
  description_en: "",
  description_ru: "Традиционный суп",
};

const productC = {
  name: "Mercimek Çorbası",
  name_en: "Lentil Soup",
  name_ru: "Чечевичный суп",
  description: "Geleneksel çorba",
  description_en: "Traditional soup",
  description_ru: "Традиционный суп",
};

const productD = {
  name: "",
  name_en: "Lentil Soup",
  name_ru: "",
  description: "",
  description_en: "Traditional soup",
  description_ru: "",
};

async function fakeTranslate(
  text: string,
  sourceLanguage: "tr" | "en",
  targetLanguage: "en" | "ru"
): Promise<string | null> {
  return `${targetLanguage}:${sourceLanguage}:${text}`;
}

describe("planProductMissingTranslations", () => {
  it("A: RU empty with filled EN only plans RU from TR", () => {
    const plan = planProductMissingTranslations(productA, "ru");
    assert.equal(plan.name?.sourceLanguage, "tr");
    assert.equal(plan.name?.text, "Mercimek Çorbası");
    assert.equal(plan.description?.text, "Geleneksel çorba");
    const enPlan = planProductMissingTranslations(productA, "en");
    assert.equal(enPlan.name, null);
    assert.equal(enPlan.description, null);
  });

  it("B: EN empty with filled RU only plans EN from TR", () => {
    const plan = planProductMissingTranslations(productB, "en");
    assert.equal(plan.name?.sourceLanguage, "tr");
    assert.equal(plan.name?.text, "Mercimek Çorbası");
    const ruPlan = planProductMissingTranslations(productB, "ru");
    assert.equal(ruPlan.name, null);
    assert.equal(ruPlan.description, null);
  });

  it("C: all filled plans nothing", () => {
    assert.deepEqual(planProductMissingTranslations(productC, "ru"), {
      name: null,
      description: null,
    });
    assert.deepEqual(planProductMissingTranslations(productC, "en"), {
      name: null,
      description: null,
    });
  });

  it("D: empty TR uses EN as RU source and does not plan EN overwrite", () => {
    const ruPlan = planProductMissingTranslations(productD, "ru");
    assert.equal(ruPlan.name?.sourceLanguage, "en");
    assert.equal(ruPlan.name?.text, "Lentil Soup");
    assert.equal(ruPlan.description?.text, "Traditional soup");
    const enPlan = planProductMissingTranslations(productD, "en");
    assert.equal(enPlan.name, null);
    assert.equal(enPlan.description, null);
  });
});

describe("fillMissingProductTranslations", () => {
  it("A: RU translate patch contains only RU fields", async () => {
    const patch = await fillMissingProductTranslations(productA, "ru", fakeTranslate);
    assert.deepEqual(productTranslationPatchKeys(patch), ["description_ru", "name_ru"]);
    assert.equal(patch.name_ru, "ru:tr:Mercimek Çorbası");
    assert.equal(patch.description_ru, "ru:tr:Geleneksel çorba");
    assert.equal(patch.name_en, undefined);
    assert.equal(patch.description_en, undefined);
    assert.equal(productA.name_en, "Lentil Soup");
  });

  it("B: EN translate patch contains only EN fields", async () => {
    const patch = await fillMissingProductTranslations(productB, "en", fakeTranslate);
    assert.deepEqual(productTranslationPatchKeys(patch), ["description_en", "name_en"]);
    assert.equal(patch.name_ru, undefined);
    assert.equal(patch.description_ru, undefined);
    assert.equal(productB.name_ru, "Чечевичный суп");
  });

  it("C: missing RU translate changes nothing", async () => {
    const patch = await fillMissingProductTranslations(productC, "ru", fakeTranslate);
    assert.deepEqual(patch, {});
  });

  it("D: RU from EN source does not include EN keys", async () => {
    const patch = await fillMissingProductTranslations(productD, "ru", fakeTranslate);
    assert.deepEqual(productTranslationPatchKeys(patch), ["description_ru", "name_ru"]);
    assert.equal(patch.name_ru, "ru:en:Lentil Soup");
    assert.equal(patch.name_en, undefined);
  });
});

describe("buildProductTranslationPatch", () => {
  it("never emits the other language", () => {
    assert.deepEqual(
      productTranslationPatchKeys(
        buildProductTranslationPatch("ru", { name: "Суп", description: "Описание" })
      ),
      ["description_ru", "name_ru"]
    );
    assert.deepEqual(
      productTranslationPatchKeys(
        buildProductTranslationPatch("en", { name: "Soup", description: "Desc" })
      ),
      ["description_en", "name_en"]
    );
  });
});
