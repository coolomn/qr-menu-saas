import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImportProduct } from "./schema";
import {
  buildProductCatalogIndex,
  catalogProductFromInsert,
  classifyImportProductMatch,
  descriptionsConflict,
  findCatalogProductByName,
  normalizeProductName,
  planImportProductCommit,
  pricesEqual,
  variantSetsEqual,
  type ExistingCatalogProduct,
} from "./product-match";

function importProduct(overrides: Partial<ImportProduct> & { name: string }): ImportProduct {
  return {
    name: overrides.name,
    name_en: overrides.name_en ?? null,
    name_ru: overrides.name_ru ?? null,
    description: overrides.description ?? null,
    description_en: overrides.description_en ?? null,
    description_ru: overrides.description_ru ?? null,
    price: overrides.price ?? null,
    variants: overrides.variants,
  };
}

const croissant: ExistingCatalogProduct = {
  id: "prod-croissant",
  name: "Sade Kruvasan",
  description: "Tereyağlı",
  price: "90",
  category_id: "cat-breakfast",
  variant_labels: [],
};

describe("normalizeProductName", () => {
  it("trims, lowercases with tr-TR, and collapses whitespace", () => {
    assert.equal(normalizeProductName("  Sade   Kruvasan  "), "sade kruvasan");
    assert.equal(normalizeProductName("ISpanak"), "ıspanak");
    assert.equal(normalizeProductName("İstanbul"), "istanbul");
  });
});

describe("findCatalogProductByName", () => {
  it("matches exact normalized name across restaurant catalog", () => {
    const index = buildProductCatalogIndex([croissant]);
    const found = findCatalogProductByName("SADE  KRUVASAN", index);
    assert.equal(found?.id, "prod-croissant");
    assert.equal(findCatalogProductByName("Çikolatalı Kruvasan", index), null);
  });
});

describe("pricesEqual / descriptionsConflict / variantSetsEqual", () => {
  it("treats equivalent prices as equal", () => {
    assert.equal(pricesEqual("90", "90 TL"), true);
    assert.equal(pricesEqual("90,00", "90"), true);
    assert.equal(pricesEqual("90", "95"), false);
  });

  it("does not conflict when existing description is empty", () => {
    assert.equal(descriptionsConflict("", "Yeni açıklama"), false);
    assert.equal(descriptionsConflict("Tereyağlı", "Farklı"), true);
    assert.equal(descriptionsConflict("Tereyağlı", "Tereyağlı"), false);
  });

  it("compares variant names as a set", () => {
    assert.equal(variantSetsEqual(["Tek", "Duble"], ["duble", "tek"]), true);
    assert.equal(variantSetsEqual(["Tek", "Duble"], ["Tek"]), false);
    assert.equal(variantSetsEqual([], []), true);
  });
});

describe("classifyImportProductMatch", () => {
  it("marks silent match when price, description, and variants align", () => {
    const match = classifyImportProductMatch(
      importProduct({ name: "Sade Kruvasan", price: "90", description: "Tereyağlı" }),
      croissant
    );
    assert.equal(match.kind, "matched");
    assert.deepEqual(match.conflicts, []);
  });

  it("flags price conflict without treating it as a new product", () => {
    const match = classifyImportProductMatch(
      importProduct({ name: "Sade Kruvasan", price: "120", description: "Tereyağlı" }),
      croissant
    );
    assert.equal(match.kind, "conflict");
    assert.deepEqual(match.conflicts, ["price"]);
    assert.equal(match.existing?.id, "prod-croissant");
  });

  it("flags description and variant conflicts", () => {
    const match = classifyImportProductMatch(
      importProduct({
        name: "Sade Kruvasan",
        price: "90",
        description: "Farklı açıklama",
        variants: [{ label: "Küçük", label_en: null, label_ru: null, price: "90" }],
      }),
      croissant
    );
    assert.equal(match.kind, "conflict");
    assert.ok(match.conflicts.includes("description"));
    assert.ok(match.conflicts.includes("variants"));
  });
});

describe("planImportProductCommit", () => {
  it("reuses existing croissant instead of creating a duplicate", () => {
    const index = buildProductCatalogIndex([croissant]);
    const plan = planImportProductCommit(
      importProduct({ name: "Sade Kruvasan", price: "90", description: "Tereyağlı" }),
      index
    );
    assert.equal(plan.mode, "reuse");
    if (plan.mode === "reuse") {
      assert.equal(plan.existing.id, "prod-croissant");
      assert.equal(plan.updatePrice, null);
    }
  });

  it("keeps existing price on conflict by default", () => {
    const index = buildProductCatalogIndex([croissant]);
    const plan = planImportProductCommit(
      importProduct({ name: "Sade Kruvasan", price: "120" }),
      index
    );
    assert.equal(plan.mode, "reuse");
    if (plan.mode === "reuse") {
      assert.equal(plan.updatePrice, null);
    }
  });

  it("updates price when user chooses import price", () => {
    const index = buildProductCatalogIndex([croissant]);
    const plan = planImportProductCommit(
      importProduct({ name: "Sade Kruvasan", price: "120" }),
      index,
      "update_from_import"
    );
    assert.equal(plan.mode, "reuse");
    if (plan.mode === "reuse") {
      assert.equal(plan.updatePrice, "120");
    }
  });

  it("creates a separate product when requested", () => {
    const index = buildProductCatalogIndex([croissant]);
    const plan = planImportProductCommit(
      importProduct({ name: "Sade Kruvasan", price: "120" }),
      index,
      "create_separate"
    );
    assert.equal(plan.mode, "create");
  });

  it("indexes a newly created product so a later All Day row reuses it", () => {
    const index = buildProductCatalogIndex([]);
    const first = importProduct({ name: "Sade Kruvasan", price: "90" });
    const created = catalogProductFromInsert("new-id", "cat-all-day", first);
    index.set(normalizeProductName(created.name), created);

    const second = planImportProductCommit(
      importProduct({ name: "sade kruvasan", price: "90" }),
      index
    );
    assert.equal(second.mode, "reuse");
    if (second.mode === "reuse") {
      assert.equal(second.existing.id, "new-id");
    }
  });
});
