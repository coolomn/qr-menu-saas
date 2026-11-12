import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { childrenByParent, dropHiddenSubcategories, isTopLevelCategory } from "./category-tree";

describe("alt kategori ağacı", () => {
  const cats = [
    { id: "tatli" },
    { id: "pasta", parent_id: "tatli" },
    { id: "kek", parent_id: "tatli" },
    { id: "yetim", parent_id: "gizli-ust" },
    { id: "icecek", parent_id: null },
  ];

  it("üst kategorisi gizli olan alt kategori de gizlenir", () => {
    assert.deepEqual(dropHiddenSubcategories(cats).map((c) => c.id), ["tatli", "pasta", "kek", "icecek"]);
  });

  it("üst kategorileri ayırır ve alt kategorileri sırayla gruplar", () => {
    assert.deepEqual(cats.filter(isTopLevelCategory).map((c) => c.id), ["tatli", "icecek"]);
    assert.deepEqual(childrenByParent(cats).get("tatli")?.map((c) => c.id), ["pasta", "kek"]);
    assert.equal(childrenByParent(cats).get("icecek"), undefined);
  });
});
