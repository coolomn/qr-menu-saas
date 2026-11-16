import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCenterEntries, ingredientKey, languageCoverage, mainGroupKey } from "./translation-center";

const data = {
  categories: [
    { id: "c1", name: "Çorbalar", main_group: "YİYECEKLER", name_en: "Soups", main_group_en: "FOODS", translations: {} },
    { id: "c2", name: "Burgerler", main_group: "YİYECEKLER", note: "", translations: { de: { main_group: "SPEISEN" } } },
    { id: "c3", name: "Alt", main_group: "YİYECEKLER", parent_id: "c2", translations: {} },
  ],
  products: [
    {
      id: "p1",
      category_id: "c1",
      name: "Mercimek",
      description: "",
      translations: { en: { name: "Lentil" } },
      removable_ingredients: [{ name: "Soğan", name_en: "Onion" }],
    },
    {
      id: "p2",
      category_id: "c2",
      name: "Burger",
      description: "Dana",
      removable_ingredients: [{ name: "soğan", translations: { de: { name: "Zwiebel" } } }, { name: "Turşu" }],
    },
  ],
  variantsByProduct: { p2: [{ id: "v1", product_id: "p2", label: "Büyük", translations: {} }] },
  menus: [{ id: "m1", name: "Akşam", description: null, name_en: "Dinner", translations: {} }],
  modifierGroups: [
    { id: "g1", name: "Soslar", translations: {}, options: [{ id: "o1", name: "Ketçap", translations: { en: { name: "Ketchup" } } }] },
  ],
};

describe("çeviri merkezi satırları", () => {
  const entries = buildCenterEntries(data);
  const byKey = new Map(entries.map((e) => [e.key, e]));

  it("ana grubu kategoriler arasında tek satırda toplar", () => {
    const g = byKey.get(mainGroupKey("yiyecekler"))!;
    assert.deepEqual(g.targetIds, ["c1", "c2", "c3"]);
    assert.deepEqual(g.translations, { en: { main_group: "FOODS" }, de: { main_group: "SPEISEN" } });
    assert.deepEqual(byKey.get("category:c1")!.source, { name: "Çorbalar" }, "boş not ve ana grup kategori satırında yok");
    assert.deepEqual(byKey.get("category:c1")!.translations, { en: { name: "Soups" } });
    assert.equal(byKey.get("category:c3")!.context, "Burgerler");
  });

  it("malzemeyi ürünler arasında (büyük/küçük harf duyarsız) tek satırda toplar", () => {
    const onion = byKey.get(ingredientKey("Soğan"))!;
    assert.deepEqual(onion.targetIds, ["p1", "p2"]);
    assert.deepEqual(onion.translations, { en: { name: "Onion" }, de: { name: "Zwiebel" } });
    assert.ok(byKey.get(ingredientKey("turşu")));
  });

  it("ürün, varyant, menü, seçenek satırlarını üretir; boş alanları atar", () => {
    assert.deepEqual(byKey.get("product:p1")!.source, { name: "Mercimek" });
    assert.deepEqual(byKey.get("product:p2")!.source, { name: "Burger", description: "Dana" });
    assert.equal(byKey.get("variant:v1")!.context, "Burger");
    assert.deepEqual(byKey.get("menu:m1")!.translations, { en: { name: "Dinner" } });
    assert.equal(byKey.get("modifier_option:o1")!.context, "Soslar");
  });

  it("dil doluluk oranı", () => {
    const cov = languageCoverage(entries, "en");
    assert.ok(cov.total > 0);
    assert.ok(cov.filled > 0 && cov.filled < cov.total);
    assert.equal(languageCoverage([], "en").percent, 100);
  });
});
