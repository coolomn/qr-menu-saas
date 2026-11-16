import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyModifierGroup,
  emptyModifierOption,
  fillMissingIngredientTranslations,
  fillMissingModifierTranslations,
  normalizePriceDelta,
  sanitizeIngredientsForSave,
  validateModifierGroup,
  type AdminModifierGroup,
} from "./modifiers";

const group = (patch: Partial<AdminModifierGroup> = {}): AdminModifierGroup => ({
  ...emptyModifierGroup(),
  name: "Soslar",
  options: [{ ...emptyModifierOption(), name: "Ranch", price_delta: "+5" }],
  ...patch,
});

describe("seçenek grubu doğrulama", () => {
  it("geçerli grubu kabul eder", () => {
    assert.equal(validateModifierGroup(group()), null);
    assert.equal(validateModifierGroup(group({ min_select: "1", max_select: "1" })), null);
  });

  it("eksik/hatalı alanları açık mesajla reddeder", () => {
    assert.match(validateModifierGroup(group({ name: " " }))!, /Grup adı/);
    assert.match(validateModifierGroup(group({ options: [emptyModifierOption()] }))!, /En az bir seçenek/);
    assert.match(
      validateModifierGroup(group({ options: [{ ...emptyModifierOption(), price_delta: "5" }] }))!,
      /adı olmalı/
    );
    assert.match(
      validateModifierGroup(group({ options: [{ ...emptyModifierOption(), name: "x", price_delta: "beş" }] }))!,
      /fiyat farkı geçersiz/
    );
    assert.match(validateModifierGroup(group({ min_select: "2", max_select: "1" }))!, /küçük olamaz/);
    assert.match(validateModifierGroup(group({ max_select: "0" }))!, /1 ile 50/);
    assert.match(validateModifierGroup(group({ min_select: "a" }))!, /tam sayı/);
    assert.match(validateModifierGroup(group({ min_select: "2" }))!, /açık seçenek sayısından/);
  });
});

describe("fiyat farkı biçimi", () => {
  it("işaretli tek biçime getirir", () => {
    assert.equal(normalizePriceDelta("15"), "+15");
    assert.equal(normalizePriceDelta("+15"), "+15");
    assert.equal(normalizePriceDelta("15 TL"), "+15");
    assert.equal(normalizePriceDelta("-5"), "-5");
    assert.equal(normalizePriceDelta(" "), "");
  });
});

describe("malzeme listesi", () => {
  it("boşları ve tekrarları atar, çevirileri yalnız doluysa yazar", () => {
    assert.deepEqual(
      sanitizeIngredientsForSave([
        { name: " Soğan ", name_en: "Onion", name_ru: "" },
        { name: "soğan" },
        { name: "" },
        { name: "Turşu" },
      ]),
      [{ name: "Soğan", name_en: "Onion" }, { name: "Turşu" }]
    );
  });
});

describe("eksik çeviriler", () => {
  const dict: Record<string, string> = { "tr>en:Soslar": "Sauces", "tr>ru:Soslar": "Соусы", "tr>en:Soğan": "Onion", "tr>ru:Soğan": "Лук" };
  const translate = async (text: string, from: string, to: string) => dict[`${from}>${to}:${text}`] ?? null;

  it("grup ve seçenek adlarında yalnız boş olanları doldurur", async () => {
    const res = await fillMissingModifierTranslations(
      group({
        options: [
          { ...emptyModifierOption(), name: "Soğan", name_en: "Red onion" },
          { ...emptyModifierOption(), name: "" },
        ],
      }),
      translate
    );
    assert.equal(res.group.name_en, "Sauces");
    assert.equal(res.group.name_ru, "Соусы");
    assert.equal(res.group.options[0].name_en, "Red onion", "dolu çeviriye dokunmaz");
    assert.equal(res.group.options[0].name_ru, "Лук");
    assert.equal(res.group.options[1].name_en, "");
    assert.equal(res.filled, 3);
  });

  it("malzemeleri çevirir; çeviri gelmezse boş bırakır", async () => {
    const res = await fillMissingIngredientTranslations([{ name: "Soğan" }, { name: "Turşu" }], translate);
    assert.deepEqual(res.ingredients[0], { name: "Soğan", name_en: "Onion", name_ru: "Лук" });
    assert.deepEqual(res.ingredients[1], { name: "Turşu" });
    assert.equal(res.filled, 2);
  });
});
