import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  attachProductExtras,
  describeSelectionRule,
  formatPriceDelta,
  loadProductExtras,
  normalizePublicModifierGroups,
  parseRemovableIngredients,
} from "./product-extras";

describe("seçim kuralı metni", () => {
  it("min/max kombinasyonlarını okunur yazar", () => {
    assert.equal(describeSelectionRule({ min_select: 1, max_select: 1 }, "tr"), "1 seçin");
    assert.equal(describeSelectionRule({ min_select: 0, max_select: 3 }, "tr"), "en fazla 3");
    assert.equal(describeSelectionRule({ min_select: 1, max_select: 3 }, "tr"), "1–3 arası seçin");
    assert.equal(describeSelectionRule({ min_select: 2, max_select: null }, "tr"), "en az 2 seçin");
    assert.equal(describeSelectionRule({ min_select: 0, max_select: null }, "tr"), "isteğe bağlı");
    assert.equal(describeSelectionRule({ min_select: 1, max_select: 1 }, "en"), "Choose 1");
    assert.equal(describeSelectionRule({ min_select: 0, max_select: 2 }, "ru"), "До 2");
  });
});

describe("fiyat farkı", () => {
  it("işaret ve para birimini ekler, sıfırı gizler", () => {
    assert.equal(formatPriceDelta("15"), "+15₺");
    assert.equal(formatPriceDelta("+15"), "+15₺");
    assert.equal(formatPriceDelta("15 TL"), "+15₺");
    assert.equal(formatPriceDelta("-5"), "−5₺");
    assert.equal(formatPriceDelta("0"), "");
    assert.equal(formatPriceDelta("0,00"), "");
    assert.equal(formatPriceDelta(""), "");
    assert.equal(formatPriceDelta(null), "");
  });
});

describe("çıkarılabilir malzemeler", () => {
  it("bozuk girdileri atar, boşlukları kırpar, üst sınırı uygular", () => {
    assert.deepEqual(parseRemovableIngredients(null), []);
    assert.deepEqual(parseRemovableIngredients("soğan"), []);
    assert.deepEqual(parseRemovableIngredients([{ name: " Soğan ", name_en: "Onion" }, { name: "" }, 5, null]), [
      { name: "Soğan", name_en: "Onion", name_ru: null },
    ]);
    const many = Array.from({ length: 50 }, (_, i) => ({ name: `m${i}` }));
    assert.equal(parseRemovableIngredients(many).length, 30);
  });
});

describe("grup doğrulama", () => {
  it("seçeneksiz ya da bozuk grupları atar", () => {
    const groups = normalizePublicModifierGroups([
      { id: "g1", name: "Soslar", min_select: 1, max_select: 1, options: [{ id: "o1", name: "Ranch", price_delta: "+5" }] },
      { id: "g2", name: "Boş", options: [] },
      { id: "", name: "x", options: [{ id: "o", name: "y" }] },
      "bozuk",
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].options[0], {
      id: "o1",
      name: "Ranch",
      name_en: null,
      name_ru: null,
      price_delta: "+5",
      calories: null,
    });
  });
});

describe("ürünlere ek alanlar", () => {
  const extras = {
    groups: normalizePublicModifierGroups([{ id: "g1", name: "Soslar", options: [{ id: "o1", name: "Ranch" }] }]),
    groupIdsByProduct: new Map([["p1", ["g1", "g-yok"]]]),
    pairingIdsByProduct: new Map([["p1", ["p2", "p-gizli", "p1"]]]),
  };

  it("yalnız görünür ürünleri ve var olan grupları bağlar; boşsa alan eklemez", () => {
    const out = attachProductExtras([{ id: "p1" }, { id: "p2" }], extras, new Set(["p1", "p2"]));
    assert.deepEqual(out[0], { id: "p1", modifier_group_ids: ["g1"], pairing_ids: ["p2"] });
    assert.deepEqual(out[1], { id: "p2" });
  });
});

describe("loadProductExtras", () => {
  function fake(tables: Record<string, unknown[]>, error: { code?: string; message: string } | null = null) {
    return {
      from: (table: string) => {
        const filters: Array<(r: Record<string, unknown>) => boolean> = [];
        const chain = {
          select: () => chain,
          eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
          order: () => chain,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(
              error
                ? { data: null, error }
                : { data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r as Record<string, unknown>))), error: null }
            ).then(resolve),
        };
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  it("bağlı grupları seçenekleriyle, bağlantıları sırasıyla döndürür", async () => {
    const R = "r1";
    const res = await loadProductExtras(
      fake({
        modifier_groups: [
          { id: "g1", restaurant_id: R, name: "Soslar", min_select: 1, max_select: 1 },
          { id: "g2", restaurant_id: R, name: "Bağlı değil" },
        ],
        modifier_options: [
          { id: "o1", restaurant_id: R, group_id: "g1", name: "Ranch", is_active: true },
          { id: "o2", restaurant_id: R, group_id: "g1", name: "Kapalı", is_active: false },
          { id: "o3", restaurant_id: R, group_id: "g2", name: "x", is_active: true },
        ],
        product_modifier_groups: [{ product_id: "p1", group_id: "g1", sort_order: 0, restaurant_id: R }],
        product_pairings: [
          { product_id: "p1", paired_product_id: "p3", sort_order: 1, restaurant_id: R },
          { product_id: "p1", paired_product_id: "p2", sort_order: 0, restaurant_id: R },
          { product_id: "p-baska-menu", paired_product_id: "p2", sort_order: 0, restaurant_id: R },
        ],
      }),
      R,
      ["p1", "p2", "p3"]
    );
    assert.deepEqual(res.groups.map((g) => [g.id, g.options.map((o) => o.id)]), [["g1", ["o1"]]]);
    assert.deepEqual(res.groupIdsByProduct.get("p1"), ["g1"]);
    assert.deepEqual(res.pairingIdsByProduct.get("p1"), ["p2", "p3"]);
    assert.equal(res.pairingIdsByProduct.has("p-baska-menu"), false);
  });

  it("tablo yoksa (migration uygulanmadı) menüyü bozmadan boş döner", async () => {
    const res = await loadProductExtras(
      fake({}, { code: "42P01", message: 'relation "modifier_groups" does not exist' }),
      "r1",
      ["p1"]
    );
    assert.equal(res.groups.length, 0);
    assert.equal(res.groupIdsByProduct.size, 0);
  });
});
