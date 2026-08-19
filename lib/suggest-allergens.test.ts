import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestAllergens } from "./suggest-allergens";

function ids(name: string, extra?: { description?: string; categoryName?: string }) {
  return suggestAllergens({
    name,
    description: extra?.description ?? "",
    categoryName: extra?.categoryName,
  });
}

function hasId(name: string, id: string, extra?: { description?: string; categoryName?: string }) {
  return ids(name, extra).some((item) => item.id === id);
}

function confidenceOf(name: string, id: string) {
  return ids(name).find((item) => item.id === id)?.confidence;
}

describe("suggestAllergens", () => {
  it("Fıstıklı Baklava suggests nuts", () => {
    assert.equal(hasId("Fıstıklı Baklava", "nuts"), true);
    assert.equal(confidenceOf("Fıstıklı Baklava", "nuts"), "explicit");
  });

  it("Cheesecake suggests dairy", () => {
    assert.equal(hasId("Cheesecake", "dairy"), true);
  });

  it("Susamlı Simit suggests sesame and gluten", () => {
    assert.equal(hasId("Susamlı Simit", "sesame"), true);
    assert.equal(hasId("Susamlı Simit", "gluten"), true);
  });

  it("Glutensiz Brownie does not suggest gluten", () => {
    const result = ids("Glutensiz Brownie");
    assert.equal(result.some((item) => item.id === "gluten"), false);
    assert.equal(result.some((item) => item.id === "egg" && item.confidence === "inferred"), true);
    assert.equal(result.some((item) => item.id === "dairy" && item.confidence === "inferred"), true);
  });

  it("Brownie with empty description infers egg and dairy", () => {
    const result = ids("Brownie", { description: "" });
    assert.equal(result.some((item) => item.id === "egg" && item.confidence === "inferred"), true);
    assert.equal(result.some((item) => item.id === "dairy" && item.confidence === "inferred"), true);
  });

  it("Vegan Brownie does not suggest dairy or egg", () => {
    const result = ids("Vegan Brownie");
    assert.equal(result.some((item) => item.id === "dairy"), false);
    assert.equal(result.some((item) => item.id === "egg"), false);
    assert.equal(result.some((item) => item.id === "vegan"), true);
  });

  it("Yoğurtlu Meze suggests dairy", () => {
    assert.equal(hasId("Yoğurtlu Meze", "dairy"), true);
  });

  it("uses category name when description is empty", () => {
    assert.equal(
      hasId("Karışık Tabak", "seafood", { description: "", categoryName: "Deniz Ürünleri" }),
      true
    );
  });
});
