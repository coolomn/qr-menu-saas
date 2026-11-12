import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMenuFilter,
  availableFilterOptions,
  EMPTY_MENU_FILTER,
  parsePriceNumber,
  productPriceRange,
} from "./menu-filters";
import type { PublicProduct } from "./product-variants";

function p(id: string, extra: Partial<PublicProduct> = {}): PublicProduct {
  return { id, category_id: "c", name: id, ...extra };
}

const v = (id: string, price: string) => ({ id, label: id, price }) as never;

describe("fiyat okuma", () => {
  it("Türkçe yazımları doğru okur", () => {
    assert.equal(parsePriceNumber("120"), 120);
    assert.equal(parsePriceNumber("120 ₺"), 120);
    assert.equal(parsePriceNumber("₺1.250"), 1250);
    assert.equal(parsePriceNumber("1.250,50"), 1250.5);
    assert.equal(parsePriceNumber("12,5"), 12.5);
    assert.equal(parsePriceNumber("99.90"), 99.9);
    assert.equal(parsePriceNumber(""), null);
    assert.equal(parsePriceNumber("Sorunuz"), null);
  });

  it("boyutlu üründe aralık varyantlardan gelir", () => {
    assert.deepEqual(productPriceRange(p("a", { price: "100", variants: [v("k", "150"), v("b", "90")] })), {
      min: 90,
      max: 150,
    });
    assert.deepEqual(productPriceRange(p("a", { price: "100" })), { min: 100, max: 100 });
    assert.equal(productPriceRange(p("a")), null);
  });
});

describe("menü filtresi", () => {
  const items = [
    p("burger", { allergens: ["gluten", "Süt"], price: "300" }),
    p("salata", { badges: ["vegan"], price: "150" }),
    p("omlet", { allergens: ["egg"], badges: ["vegetarian"], price: "200" }),
    p("acili", { allergens: ["spicy"], price: "250" }),
    p("su"),
  ];

  it("filtre yokken her şey aynı sırada döner", () => {
    assert.deepEqual(applyMenuFilter(items, EMPTY_MENU_FILTER).map((x) => x.id), [
      "burger",
      "salata",
      "omlet",
      "acili",
      "su",
    ]);
  });

  it("içermesin: seçilen alerjeni içerenler gizlenir (TR yazım da tanınır)", () => {
    const r = applyMenuFilter(items, { ...EMPTY_MENU_FILTER, excludeAllergens: ["milk"] });
    assert.deepEqual(r.map((x) => x.id), ["salata", "omlet", "acili", "su"]);
  });

  it("vejetaryen tercihi vegan ürünleri de kapsar", () => {
    const r = applyMenuFilter(items, { ...EMPTY_MENU_FILTER, diets: ["vegetarian"] });
    assert.deepEqual(r.map((x) => x.id), ["salata", "omlet"]);
  });

  it("acı tercihi alerjen listesindeki 'spicy' etiketini de tanır", () => {
    const r = applyMenuFilter(items, { ...EMPTY_MENU_FILTER, diets: ["spicy"] });
    assert.deepEqual(r.map((x) => x.id), ["acili"]);
  });

  it("fiyata göre sıralar; fiyatsız ürün sona kalır", () => {
    assert.deepEqual(
      applyMenuFilter(items, { ...EMPTY_MENU_FILTER, sort: "price_asc" }).map((x) => x.id),
      ["salata", "omlet", "acili", "burger", "su"]
    );
    assert.deepEqual(
      applyMenuFilter(items, { ...EMPTY_MENU_FILTER, sort: "price_desc" }).map((x) => x.id),
      ["burger", "acili", "omlet", "salata", "su"]
    );
  });

  it("ada göre Türkçe alfabeyle sıralar", () => {
    const r = applyMenuFilter([p("Çorba"), p("Ayran"), p("Ciğer")], { ...EMPTY_MENU_FILTER, sort: "name" });
    assert.deepEqual(r.map((x) => x.id), ["Ayran", "Ciğer", "Çorba"]);
  });

  it("yalnızca menüde geçen seçenekleri listeler", () => {
    const o = availableFilterOptions(items);
    assert.deepEqual(o.allergens, ["egg", "gluten", "milk"]);
    assert.deepEqual(o.diets, ["vegan", "vegetarian", "spicy"]);
  });
});

describe("boyutlu ürün fiyat aralığı", () => {
  it("en ucuz ve en pahalı varyantı verir; tek/aynı fiyatta null", async () => {
    const { variantPriceRangeRaw } = await import("./menu-filters");
    assert.deepEqual(
      variantPriceRangeRaw(p("a", { variants: [v("o", "1.250"), v("k", "300"), v("b", "900")] })),
      { min: "300", max: "1.250" }
    );
    assert.equal(variantPriceRangeRaw(p("a", { variants: [v("k", "300")] })), null);
    assert.equal(variantPriceRangeRaw(p("a", { variants: [v("k", "300"), v("b", "300 ₺")] })), null);
  });
});
