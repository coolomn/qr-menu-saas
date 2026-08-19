import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productThumbnailSize } from "./images/prepare-presets";
import {
  publicProductStoragePathFromUrl,
  resolvePublicProductCardImageSrc,
} from "./public-menu/product-image-urls";

describe("productThumbnailSize", () => {
  it("does not upscale or crop", () => {
    assert.deepEqual(productThumbnailSize(200, 150), { width: 200, height: 150 });
    assert.deepEqual(productThumbnailSize(800, 1200), { width: 400, height: 600 });
    assert.deepEqual(productThumbnailSize(2000, 1000), { width: 400, height: 200 });
  });
});

describe("resolvePublicProductCardImageSrc", () => {
  it("prefers thumbnail and falls back to original", () => {
    assert.equal(
      resolvePublicProductCardImageSrc({
        thumbnail_url: "https://cdn.example/thumb.webp",
        image_url: "https://cdn.example/full.jpg",
      }),
      "https://cdn.example/thumb.webp"
    );
    assert.equal(
      resolvePublicProductCardImageSrc({
        thumbnail_url: "",
        image_url: "https://cdn.example/full.jpg",
      }),
      "https://cdn.example/full.jpg"
    );
    assert.equal(
      resolvePublicProductCardImageSrc({ thumbnail_url: null, image_url: "  " }),
      null
    );
  });
});

describe("publicProductStoragePathFromUrl", () => {
  it("accepts only this restaurant's product objects", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    const url = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/products/abc-thumb.webp`;
    assert.equal(
      publicProductStoragePathFromUrl(url, rid),
      `restaurants/${rid}/products/abc-thumb.webp`
    );
    assert.equal(publicProductStoragePathFromUrl(url, "22222222-2222-2222-2222-222222222222"), null);
    assert.equal(
      publicProductStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/logo/x.png`,
        rid
      ),
      null
    );
  });
});
