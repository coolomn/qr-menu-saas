import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categorySiblingPosition,
  dropCategoryInTree,
  moveCategoryInTree,
  orderCategoryTree,
} from "./category-order";

// Veritabanı sırası: alt kategoriler üst kategorilerinden uzakta duruyor (eski düz sıralama).
const cats = [
  { id: "pasta", parent_id: "tatli" },
  { id: "corba" },
  { id: "tatli" },
  { id: "icecek", parent_id: null },
  { id: "kek", parent_id: "tatli" },
  { id: "yetim", parent_id: "silinmis" },
];
const ids = (list: { id: string }[] | null) => list?.map((c) => c.id) ?? null;

describe("admin kategori sıralaması", () => {
  it("alt kategorileri üst kategorinin hemen altına dizer", () => {
    assert.deepEqual(ids(orderCategoryTree(cats)), ["corba", "tatli", "pasta", "kek", "icecek", "yetim"]);
  });

  it("alt kategori yalnız kendi kardeşleri arasında yer değiştirir", () => {
    assert.deepEqual(ids(moveCategoryInTree(cats, "kek", -1)), ["corba", "tatli", "kek", "pasta", "icecek", "yetim"]);
    assert.equal(moveCategoryInTree(cats, "pasta", -1), null);
    assert.equal(moveCategoryInTree(cats, "kek", 1), null);
  });

  it("üst kategori taşınınca alt kategorileri de onunla gider", () => {
    assert.deepEqual(ids(moveCategoryInTree(cats, "tatli", -1)), ["tatli", "pasta", "kek", "corba", "icecek", "yetim"]);
    assert.deepEqual(ids(moveCategoryInTree(cats, "tatli", 1)), ["corba", "icecek", "tatli", "pasta", "kek", "yetim"]);
    assert.equal(moveCategoryInTree(cats, "corba", -1), null);
  });

  it("sürükle-bırak farklı üst kategoriler arasında yapılmaz", () => {
    assert.equal(dropCategoryInTree(cats, "pasta", "corba"), null);
    assert.equal(dropCategoryInTree(cats, "corba", "kek"), null);
    assert.deepEqual(ids(dropCategoryInTree(cats, "pasta", "kek")), ["corba", "tatli", "kek", "pasta", "icecek", "yetim"]);
    assert.deepEqual(ids(dropCategoryInTree(cats, "icecek", "corba")), ["icecek", "corba", "tatli", "pasta", "kek", "yetim"]);
  });

  it("kardeşler içindeki konumu verir", () => {
    assert.deepEqual(categorySiblingPosition(cats, "kek"), { index: 1, count: 2 });
    assert.deepEqual(categorySiblingPosition(cats, "yetim"), { index: 3, count: 4 });
  });
});
