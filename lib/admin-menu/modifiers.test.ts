import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyModifierGroup,
  emptyModifierOption,
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
