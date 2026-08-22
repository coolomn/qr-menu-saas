import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  menuCollectionCardImageSize,
  buildMenuCollectionCardImageObjectPath,
  MENU_COLLECTION_CARD_MAX_LONG_EDGE,
} from "../images/prepare-presets";
import {
  getMenuCollectionEmoji,
  resolveMenuCollectionCardVisual,
} from "../public-menu/display";
import { publicMenuCollectionCardStoragePathFromUrl } from "../public-menu/product-image-urls";
import { normalizeMenuCollectionCardVisualType } from "./types";
import { createMenuCollectionSchema, patchMenuCollectionSchema } from "./validation";

describe("menu collection card visual types", () => {
  it("defaults unknown values to icon for backward compatibility", () => {
    assert.equal(normalizeMenuCollectionCardVisualType(undefined), "icon");
    assert.equal(normalizeMenuCollectionCardVisualType(null), "icon");
    assert.equal(normalizeMenuCollectionCardVisualType("weird"), "icon");
    assert.equal(normalizeMenuCollectionCardVisualType("image"), "image");
    assert.equal(normalizeMenuCollectionCardVisualType("none"), "none");
  });

  it("accepts card visual fields on create and patch schemas", () => {
    const created = createMenuCollectionSchema.parse({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      name: "Kahvaltı",
      card_visual_type: "image",
      card_image_url: "https://cdn.example/restaurants/x/menu-collections/a.webp",
    });
    assert.equal(created.card_visual_type, "image");
    assert.ok(created.card_image_url);

    const patched = patchMenuCollectionSchema.parse({
      card_visual_type: "none",
      card_image_url: null,
    });
    assert.equal(patched.card_visual_type, "none");
    assert.equal(patched.card_image_url, null);

    const legacyCreate = createMenuCollectionSchema.parse({
      restaurantId: "11111111-1111-4111-8111-111111111111",
      name: "Ana Menü",
    });
    assert.equal(legacyCreate.card_visual_type, "icon");
  });
});

describe("resolveMenuCollectionCardVisual", () => {
  it("keeps legacy/default collections as heuristic icon", () => {
    const visual = resolveMenuCollectionCardVisual({
      name: "Kahvaltı Menüsü",
      card_visual_type: "icon",
      card_image_url: null,
    });
    assert.deepEqual(visual, {
      mode: "icon",
      emoji: getMenuCollectionEmoji({ name: "Kahvaltı Menüsü" }),
    });
  });

  it("shows custom image when type is image and url is set", () => {
    const visual = resolveMenuCollectionCardVisual({
      name: "Pizza",
      card_visual_type: "image",
      card_image_url: "https://cdn.example/card.webp",
    });
    assert.deepEqual(visual, {
      mode: "image",
      imageUrl: "https://cdn.example/card.webp",
    });
  });

  it("falls back to icon when image type has empty url", () => {
    const visual = resolveMenuCollectionCardVisual({
      name: "İçecekler",
      card_visual_type: "image",
      card_image_url: "  ",
    });
    assert.equal(visual.mode, "icon");
    if (visual.mode === "icon") {
      assert.equal(visual.emoji, getMenuCollectionEmoji({ name: "İçecekler" }));
    }
  });

  it("hides visual entirely for none", () => {
    assert.deepEqual(
      resolveMenuCollectionCardVisual({
        name: "All Day Menu",
        card_visual_type: "none",
        card_image_url: "https://cdn.example/ignored.webp",
      }),
      { mode: "none" }
    );
  });

  it("allows different menus to use different visual modes", () => {
    const menus = [
      {
        name: "Kahvaltı",
        card_visual_type: "image" as const,
        card_image_url: "https://cdn.example/a.webp",
      },
      { name: "All Day", card_visual_type: "none" as const, card_image_url: null },
      { name: "Pizza", card_visual_type: "icon" as const, card_image_url: null },
    ];
    assert.equal(resolveMenuCollectionCardVisual(menus[0]).mode, "image");
    assert.equal(resolveMenuCollectionCardVisual(menus[1]).mode, "none");
    assert.equal(resolveMenuCollectionCardVisual(menus[2]).mode, "icon");
  });
});

describe("menuCollectionCardImageSize", () => {
  it("caps long edge near 400 without upscale or crop", () => {
    assert.equal(MENU_COLLECTION_CARD_MAX_LONG_EDGE, 400);
    assert.deepEqual(menuCollectionCardImageSize(200, 150), { width: 200, height: 150 });
    assert.deepEqual(menuCollectionCardImageSize(800, 600), { width: 400, height: 300 });
    assert.deepEqual(menuCollectionCardImageSize(600, 1200), { width: 200, height: 400 });
  });
});

describe("menu collection card storage path guard", () => {
  it("builds versioned menu-collections paths", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    assert.equal(
      buildMenuCollectionCardImageObjectPath(rid, "1700000000000-abc", "webp"),
      `restaurants/${rid}/menu-collections/1700000000000-abc.webp`
    );
  });

  it("only accepts this restaurant's menu-collections objects for cleanup", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    const other = "22222222-2222-2222-2222-222222222222";
    const url = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/menu-collections/card.webp`;
    assert.equal(
      publicMenuCollectionCardStoragePathFromUrl(url, rid),
      `restaurants/${rid}/menu-collections/card.webp`
    );
    assert.equal(publicMenuCollectionCardStoragePathFromUrl(url, other), null);
    assert.equal(
      publicMenuCollectionCardStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/products/x.webp`,
        rid
      ),
      null
    );
    assert.equal(
      publicMenuCollectionCardStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${other}/menu-collections/x.webp`,
        rid
      ),
      null
    );
  });
});
