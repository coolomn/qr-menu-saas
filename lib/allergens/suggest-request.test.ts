import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestAllergensBodySchema } from "./suggest-request";

describe("suggestAllergensBodySchema", () => {
  it("turns null / non-string fields into empty strings (legacy behaviour)", () => {
    const res = suggestAllergensBodySchema.safeParse({ name: "Lahmacun", name_en: null, description: 42 });
    assert.equal(res.success, true);
    if (!res.success) return;
    assert.equal(res.data.name, "Lahmacun");
    assert.equal(res.data.name_en, "");
    assert.equal(res.data.description, "");
    assert.equal(res.data.restaurantId, undefined);
  });

  it("truncates long text instead of rejecting it", () => {
    const res = suggestAllergensBodySchema.safeParse({ name: "a".repeat(500), description: "b".repeat(10_000) });
    assert.equal(res.success, true);
    if (!res.success) return;
    assert.equal(res.data.name.length, 300);
    assert.equal(res.data.description.length, 3000);
  });

  it("accepts any well-formed id and ignores empty restaurantId", () => {
    const ok = suggestAllergensBodySchema.safeParse({ restaurantId: "11111111-1111-1111-1111-111111111111" });
    assert.equal(ok.success, true);
    const empty = suggestAllergensBodySchema.safeParse({ restaurantId: "  " });
    assert.equal(empty.success, true);
    if (empty.success) assert.equal(empty.data.restaurantId, undefined);
  });

  it("rejects a malformed restaurantId", () => {
    assert.equal(suggestAllergensBodySchema.safeParse({ restaurantId: "not-a-uuid" }).success, false);
  });
});
