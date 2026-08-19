import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeAllergensDeterministic,
  mergeAllergenSuggestions,
  parseAllergenAiResponse,
  runAllergenSuggestionPipeline,
  shouldCallAllergenAi,
  suggestAllergens,
} from "./suggest-allergens";

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
    assert.equal(
      shouldCallAllergenAi(
        { name: "Fıstıklı Baklava" },
        analyzeAllergensDeterministic({ name: "Fıstıklı Baklava" })
      ),
      false
    );
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
      hasId("Karışık Tabak", "crustaceans", { description: "", categoryName: "Deniz Ürünleri" }),
      true
    );
  });

  it("Latte infers dairy without AI", () => {
    const result = ids("Latte");
    assert.equal(result.some((item) => item.id === "dairy" && item.confidence === "inferred"), true);
    assert.equal(
      shouldCallAllergenAi({ name: "Latte" }, analyzeAllergensDeterministic({ name: "Latte" })),
      false
    );
  });

  it("Oat Milk Latte does not suggest dairy", () => {
    const result = ids("Oat Milk Latte");
    assert.equal(result.some((item) => item.id === "dairy"), false);
  });

  it("Almond Milk Latte drops dairy and suggests nuts", () => {
    const result = ids("Almond Milk Latte");
    assert.equal(result.some((item) => item.id === "dairy"), false);
    assert.equal(result.some((item) => item.id === "nuts"), true);
  });

  it("Shrimp Cocktail suggests crustaceans explicitly", () => {
    assert.equal(hasId("Shrimp Cocktail", "crustaceans"), true);
    assert.equal(confidenceOf("Shrimp Cocktail", "crustaceans"), "explicit");
  });

  it("Caesar Salad does not invent a pile of allergens deterministically", () => {
    const result = ids("Caesar Salad", { description: "" });
    assert.equal(result.length <= 1, true);
  });
});

describe("allergen AI merge and gating", () => {
  it("calls AI for White Russian in cocktails and keeps dairy inferred", async () => {
    const input = { name: "White Russian", categoryName: "Cocktails" };
    const det = analyzeAllergensDeterministic(input);
    assert.equal(shouldCallAllergenAi(input, det), true);
    const merged = await runAllergenSuggestionPipeline(input, async () => [
      { id: "dairy", confidence: "inferred", reason: "Cocktail typically contains cream" },
    ]);
    assert.equal(merged.some((item) => item.id === "dairy" && item.confidence === "inferred"), true);
  });

  it("accepts empty AI for Margarita when confidence is low", async () => {
    const input = { name: "Margarita", description: "" };
    assert.equal(shouldCallAllergenAi(input, analyzeAllergensDeterministic(input)), true);
    const merged = await runAllergenSuggestionPipeline(input, async () => []);
    assert.deepEqual(merged, []);
  });

  it("does not let AI restore a negated allergen", () => {
    const det = analyzeAllergensDeterministic({ name: "Vegan Brownie" });
    const merged = mergeAllergenSuggestions(
      det.suggestions,
      [{ id: "dairy", confidence: "explicit" }],
      det.exclusions
    );
    assert.equal(merged.some((item) => item.id === "dairy"), false);
  });

  it("ignores unknown AI ids and prefers explicit over inferred", () => {
    const parsed = parseAllergenAiResponse({
      suggestions: [
        { id: "not-an-allergen", confidence: "explicit" },
        { id: "milk", confidence: "inferred" },
        { id: "vegan", confidence: "explicit" },
      ],
    });
    assert.equal(parsed.some((item) => item.id === "dairy"), true);
    assert.equal(parsed.some((item) => item.id === "vegan"), false);
    const merged = mergeAllergenSuggestions(
      [{ id: "dairy", confidence: "explicit" }],
      [{ id: "dairy", confidence: "inferred" }],
      []
    );
    assert.equal(merged.find((item) => item.id === "dairy")?.confidence, "explicit");
  });

  it("falls back to deterministic suggestions when AI throws", async () => {
    const result = await runAllergenSuggestionPipeline({ name: "Brownie" }, async () => {
      throw new Error("timeout");
    });
    assert.equal(result.some((item) => item.id === "egg"), true);
  });
});
