import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMenuCollectionSchema, patchMenuCollectionSchema } from "./validation";

const RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";

describe("patchMenuCollectionSchema", () => {
  it("toggling is_active must not touch any other field (regression: it used to null translations)", () => {
    const parsed = patchMenuCollectionSchema.parse({ is_active: false });
    const defined = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
    assert.deepEqual(defined, { is_active: false });
  });

  it("explicit empty/null still clears a field", () => {
    const parsed = patchMenuCollectionSchema.parse({ name_en: "", description: null, start_time: "" });
    assert.equal(parsed.name_en, null);
    assert.equal(parsed.description, null);
    assert.equal(parsed.start_time, null);
    assert.equal(parsed.name_ru, undefined);
  });

  it("rejects an empty patch", () => {
    assert.throws(() => patchMenuCollectionSchema.parse({}));
  });

  it("schedule: absent is untouched, null clears, valid is normalised, garbage clears", () => {
    assert.equal(patchMenuCollectionSchema.parse({ is_active: true }).schedule, undefined);
    assert.equal(patchMenuCollectionSchema.parse({ schedule: null }).schedule, null);
    assert.equal(patchMenuCollectionSchema.parse({ schedule: { windows: "x" } }).schedule, null);
    const s = patchMenuCollectionSchema.parse({
      schedule: { windows: [{ days: [3, 1, 1], start: "07:00", end: "11:00" }], outside: "hide" },
    }).schedule;
    assert.deepEqual(s, {
      starts_on: null,
      ends_on: null,
      windows: [{ days: [1, 3], start: "07:00", end: "11:00" }],
      outside: "hide",
    });
  });

  it("a schedule-only patch is a valid patch", () => {
    assert.doesNotThrow(() => patchMenuCollectionSchema.parse({ schedule: null }));
  });
});

describe("createMenuCollectionSchema", () => {
  it("defaults schedule to null (always)", () => {
    const parsed = createMenuCollectionSchema.parse({ restaurantId: RESTAURANT_ID, name: "Kahvaltı" });
    assert.equal(parsed.schedule, null);
    assert.equal(parsed.name_en, null);
  });
});
