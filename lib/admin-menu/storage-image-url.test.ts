import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMenuCollectionSchema, isAllowedStorageImageUrl } from "./validation";

const SUPA = "https://abc.supabase.co";
const OK = `${SUPA}/storage/v1/object/public/menu-public/restaurants/r1/menu-collections/x.webp`;

describe("isAllowedStorageImageUrl", () => {
  it("accepts public objects in our Supabase storage", () => {
    assert.equal(isAllowedStorageImageUrl(OK, SUPA), true);
  });

  it("rejects other hosts, http, and non-storage paths", () => {
    assert.equal(isAllowedStorageImageUrl("https://evil.example/x.webp", SUPA), false);
    assert.equal(isAllowedStorageImageUrl(OK.replace("https:", "http:"), SUPA), false);
    assert.equal(isAllowedStorageImageUrl(`${SUPA}/rest/v1/restaurants`, SUPA), false);
    assert.equal(isAllowedStorageImageUrl("https://abc.supabase.co.evil.example/storage/v1/object/public/x", SUPA), false);
    assert.equal(isAllowedStorageImageUrl("javascript:alert(1)", SUPA), false);
  });

  it("rejects everything when Supabase URL is not configured", () => {
    assert.equal(isAllowedStorageImageUrl(OK, undefined), false);
  });
});

describe("menu collection card_image_url", () => {
  it("allows empty / null and rejects foreign hosts", () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
    try {
      const base = { restaurantId: "11111111-1111-4111-8111-111111111111", name: "Ana Menü" };
      assert.equal(createMenuCollectionSchema.safeParse({ ...base, card_image_url: "" }).success, true);
      assert.equal(createMenuCollectionSchema.safeParse({ ...base, card_image_url: null }).success, true);
      assert.equal(createMenuCollectionSchema.safeParse({ ...base, card_image_url: OK }).success, true);
      assert.equal(
        createMenuCollectionSchema.safeParse({ ...base, card_image_url: "https://evil.example/a.png" }).success,
        false
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
    }
  });
});
