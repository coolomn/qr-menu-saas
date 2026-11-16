import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeMenuHealth, gradeForScore, topImprovements, type MenuHealthInput } from "./menu-health";

const FULL_VENUE = { hasLogo: true, hasOpeningHours: true, hasContact: true };

const goodProduct = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  category_id: "c1",
  name: `Ürün ${id}`,
  description: "Taze malzemelerle hazırlanan özel tarif.",
  price: "120",
  image_url: "https://cdn.example.com/a.jpg",
  allergens: ["gluten"],
  is_active: true,
  translations: { en: { name: "Item", description: "Fresh recipe" } },
  ...extra,
});

const input = (over: Partial<MenuHealthInput> = {}): MenuHealthInput => ({
  products: [goodProduct("p1"), goodProduct("p2")],
  variantsByProduct: {},
  categories: [{ id: "c1", name: "Ana yemek", is_active: true }],
  translationLanguages: ["en"],
  venue: FULL_VENUE,
  ...over,
});

describe("computeMenuHealth", () => {
  it("scores a fully filled menu 100", () => {
    const h = computeMenuHealth(input());
    assert.equal(h.score, 100);
    assert.equal(h.grade, "excellent");
    assert.equal(h.productCount, 2);
    assert.ok(h.checks.every((c) => c.percent === 100 && c.potentialGain === 0));
    assert.deepEqual(h.emptyCategories, []);
  });

  it("returns no score when there are no visible products", () => {
    const h = computeMenuHealth(input({ products: [] }));
    assert.equal(h.score, null);
    assert.equal(h.grade, null);
    assert.deepEqual(h.checks, []);
  });

  it("ignores inactive products and products in inactive categories", () => {
    const h = computeMenuHealth(
      input({
        products: [
          goodProduct("p1"),
          goodProduct("hidden", { is_active: false, image_url: "", description: "" }),
          goodProduct("in-off-cat", { category_id: "c2", image_url: "" }),
        ],
        categories: [
          { id: "c1", name: "A", is_active: true },
          { id: "c2", name: "B", is_active: false },
        ],
      })
    );
    assert.equal(h.productCount, 1);
    assert.equal(h.score, 100);
  });

  it("counts missing photo, short description, unclear price and allergens per product", () => {
    const h = computeMenuHealth(
      input({
        products: [
          goodProduct("p1"),
          goodProduct("p2", { image_url: "", thumbnail_url: null, description: "kısa", price: "Sorunuz", allergens: [] }),
        ],
      })
    );
    const byId = Object.fromEntries(h.checks.map((c) => [c.id, c]));
    for (const id of ["photo", "description", "price", "allergens"] as const) {
      assert.deepEqual(byId[id].missingProductIds, ["p2"], id);
      assert.equal(byId[id].percent, 50, id);
    }
    // Çeviri tam kalır; işletme tam.
    assert.equal(byId.translations.percent, 100);
    assert.equal(byId.venue.percent, 100);
    // Alerjen skora girmez. (50*30 + 50*25 + 50*20 + 100*15 + 100*10)/100 = 62.5 → 62
    assert.equal(h.score, 62);
    assert.equal(h.grade, "fair");
  });

  it("accepts a thumbnail as a photo", () => {
    const h = computeMenuHealth(input({ products: [goodProduct("p1", { image_url: "", thumbnail_url: "https://x/t.jpg" })] }));
    assert.equal(h.checks.find((c) => c.id === "photo")?.percent, 100);
  });

  it("uses variant prices for sized products", () => {
    const sized = goodProduct("p1", { price: "" });
    const ok = computeMenuHealth(input({ products: [sized], variantsByProduct: { p1: [{ price: "200", is_active: true }] } }));
    assert.equal(ok.checks.find((c) => c.id === "price")?.percent, 100);
    const bad = computeMenuHealth(
      input({ products: [sized], variantsByProduct: { p1: [{ price: "", is_active: true }, { price: "300", is_active: false }] } })
    );
    assert.equal(bad.checks.find((c) => c.id === "price")?.percent, 0);
  });

  it("measures translation coverage per language field and lists affected products", () => {
    const h = computeMenuHealth(
      input({
        translationLanguages: ["en", "de"],
        products: [goodProduct("p1"), goodProduct("p2", { translations: {} })],
      })
    );
    const tr = h.checks.find((c) => c.id === "translations")!;
    // 2 ürün × 2 dil × (ad+açıklama) = 8 alan; p1 yalnız EN dolu (2), p2 hiç → 2/8 dolu
    assert.equal(tr.total, 8);
    assert.equal(tr.filled, 2);
    assert.equal(tr.percent, 25);
    assert.deepEqual(tr.missingProductIds, ["p1", "p2"]);
  });

  it("drops the translation check from the score when no language is enabled", () => {
    const h = computeMenuHealth(input({ translationLanguages: [] }));
    assert.equal(h.score, 100);
    assert.equal(h.checks.find((c) => c.id === "translations")?.potentialGain, 0);
  });

  it("scores venue info as a share of 3 items", () => {
    const h = computeMenuHealth(input({ venue: { hasLogo: true, hasOpeningHours: false, hasContact: false } }));
    const venue = h.checks.find((c) => c.id === "venue")!;
    assert.equal(venue.filled, 1);
    assert.equal(venue.percent, 33);
    assert.equal(venue.fixTarget, "settings");
  });

  it("rounds down so 100 always means nothing is missing", () => {
    const products = Array.from({ length: 300 }, (_, i) => goodProduct(`p${i}`, i === 0 ? { image_url: "" } : {}));
    const h = computeMenuHealth(input({ products }));
    assert.equal(h.checks.find((c) => c.id === "photo")?.percent, 99);
    assert.ok(h.score! < 100);
  });

  it("finds empty active categories, counting subcategory products for the parent", () => {
    const h = computeMenuHealth(
      input({
        products: [goodProduct("p1", { category_id: "sub" })],
        categories: [
          { id: "parent", name: "İçecekler", is_active: true, parent_id: null },
          { id: "sub", name: "Sıcak", is_active: true, parent_id: "parent" },
          { id: "empty", name: "Tatlılar", is_active: true },
          { id: "off", name: "Kapalı", is_active: false },
        ],
      })
    );
    assert.deepEqual(h.emptyCategories, [{ id: "empty", name: "Tatlılar" }]);
  });
});

describe("gradeForScore", () => {
  it("maps thresholds", () => {
    assert.equal(gradeForScore(100), "excellent");
    assert.equal(gradeForScore(90), "excellent");
    assert.equal(gradeForScore(89), "good");
    assert.equal(gradeForScore(75), "good");
    assert.equal(gradeForScore(74), "fair");
    assert.equal(gradeForScore(50), "fair");
    assert.equal(gradeForScore(49), "poor");
  });
});

describe("topImprovements", () => {
  it("lists the checks that would add the most points first", () => {
    const h = computeMenuHealth(
      input({
        products: [goodProduct("p1", { image_url: "", allergens: [] })],
        venue: { hasLogo: false, hasOpeningHours: false, hasContact: false },
      })
    );
    const top = topImprovements(h, 3).map((c) => c.id);
    // Alerjen bilgi kartıdır, puan getirmez → yalnız fotoğraf (30) ve işletme bilgisi (10).
    assert.deepEqual(top, ["photo", "venue"]);
    assert.deepEqual(topImprovements(computeMenuHealth(input())), []);
  });
});

describe("allergen info card (not scored)", () => {
  it("does not count vegan/spicy diet tags or unknown legacy text as an allergen", () => {
    const h = computeMenuHealth(
      input({
        products: [
          goodProduct("tags", { allergens: ["vegan", "spicy"] }),
          goodProduct("legacy", { allergens: ["bilinmeyen-metin"] }),
          goodProduct("real", { allergens: ["vegan", "gluten"] }),
          goodProduct("none", { allergens: [] }),
        ],
      })
    );
    const al = h.checks.find((c) => c.id === "allergens")!;
    assert.deepEqual(al.missingProductIds, ["tags", "legacy", "none"]);
    assert.equal(al.filled, 1);
  });

  it("never changes the score or offers points", () => {
    const withAllergens = computeMenuHealth(input());
    const withoutAllergens = computeMenuHealth(
      input({ products: [goodProduct("p1", { allergens: [] }), goodProduct("p2", { allergens: [] })] })
    );
    assert.equal(withAllergens.score, 100);
    assert.equal(withoutAllergens.score, 100);
    const al = withoutAllergens.checks.find((c) => c.id === "allergens")!;
    assert.equal(al.scored, false);
    assert.equal(al.potentialGain, 0);
    assert.equal(al.weight, 0);
  });
});

describe("computeMenuHealth edge cases", () => {
  it("hides subcategories whose parent category is inactive or missing (same rule as the customer menu)", () => {
    const h = computeMenuHealth(
      input({
        products: [
          goodProduct("ok", { category_id: "sub-ok" }),
          goodProduct("hidden1", { category_id: "sub-off", image_url: "" }),
          goodProduct("hidden2", { category_id: "sub-orphan", image_url: "" }),
        ],
        categories: [
          { id: "top-ok", name: "Açık", is_active: true },
          { id: "top-off", name: "Kapalı", is_active: false },
          { id: "sub-ok", name: "Alt açık", is_active: true, parent_id: "top-ok" },
          { id: "sub-off", name: "Alt (üst kapalı)", is_active: true, parent_id: "top-off" },
          { id: "sub-orphan", name: "Alt (üst yok)", is_active: true, parent_id: "silinmis" },
        ],
      })
    );
    assert.equal(h.productCount, 1);
    assert.equal(h.score, 100);
    // Müşteride görünmeyen alt kategoriler "aktif ama boş" diye de listelenmez.
    assert.deepEqual(h.emptyCategories, []);
  });

  it("treats null/undefined is_active as visible", () => {
    const h = computeMenuHealth(
      input({
        products: [goodProduct("p1", { is_active: null }), goodProduct("p2", { is_active: undefined })],
        categories: [{ id: "c1", name: "A", is_active: null }],
      })
    );
    assert.equal(h.productCount, 2);
  });

  it("survives parent_id cycles without hanging", () => {
    const h = computeMenuHealth(
      input({
        products: [goodProduct("p1", { category_id: "a" })],
        categories: [
          { id: "a", name: "A", is_active: true, parent_id: "b" },
          { id: "b", name: "B", is_active: true, parent_id: "a" },
        ],
      })
    );
    assert.equal(typeof h.score, "number");
  });

  it("requires every active variant to have a price", () => {
    const sized = goodProduct("p1", { price: "" });
    const partial = computeMenuHealth(
      input({
        products: [sized],
        variantsByProduct: { p1: [{ price: "200", is_active: true }, { price: "", is_active: true }] },
      })
    );
    assert.equal(partial.checks.find((c) => c.id === "price")?.percent, 0);
  });

  it("counts a price of 0 as filled (free items such as bread exist)", () => {
    const h = computeMenuHealth(input({ products: [goodProduct("p1", { price: "0" })] }));
    assert.equal(h.checks.find((c) => c.id === "price")?.percent, 100);
  });

  it("reads translations from the legacy name_en/name_ru columns too", () => {
    const h = computeMenuHealth(
      input({
        translationLanguages: ["en", "ru"],
        products: [
          goodProduct("p1", {
            translations: undefined,
            name_en: "Item",
            description_en: "Fresh recipe",
            name_ru: "Блюдо",
            description_ru: "Описание",
          }),
        ],
      })
    );
    assert.equal(h.checks.find((c) => c.id === "translations")?.percent, 100);
  });

  it("only counts source fields that exist (empty description is not a translation gap)", () => {
    const h = computeMenuHealth(
      input({
        translationLanguages: ["en"],
        products: [goodProduct("p1", { description: "", translations: { en: { name: "Item" } } })],
      })
    );
    const tr = h.checks.find((c) => c.id === "translations")!;
    assert.equal(tr.total, 1);
    assert.equal(tr.percent, 100);
  });

  it("lists empty categories even when there are no products at all", () => {
    const h = computeMenuHealth(input({ products: [], categories: [{ id: "c1", name: "Boş", is_active: true }] }));
    assert.equal(h.score, null);
    assert.deepEqual(h.emptyCategories, [{ id: "c1", name: "Boş" }]);
  });
});
