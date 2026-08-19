import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMAGE_ERROR_TOO_LARGE,
  IMAGE_ERROR_UNSUPPORTED,
} from "./errors";
import {
  MAX_IMAGE_SOURCE_BYTES,
  assertImageSource,
  fitWithinLongEdge,
  isAllowedImageMime,
} from "./prepare-image";
import {
  PRODUCT_FULL_MAX_LONG_EDGE,
  PRODUCT_IMAGE_QUALITY,
  PRODUCT_THUMBNAIL_MAX_WIDTH,
  buildProductImageObjectPaths,
  productFullImageSize,
  productThumbnailSize,
} from "./prepare-presets";
import { resolvePublicProductCardImageSrc } from "@/lib/public-menu/product-image-urls";

describe("image source limits", () => {
  it("allows jpeg/png/webp and rejects other types", () => {
    assert.equal(isAllowedImageMime("image/jpeg"), true);
    assert.equal(isAllowedImageMime("image/png"), true);
    assert.equal(isAllowedImageMime("image/webp"), true);
    assert.equal(isAllowedImageMime("image/gif"), false);
    assert.equal(isAllowedImageMime("image/heic"), false);
  });

  it("rejects sources over 20 MB", () => {
    assert.doesNotThrow(() =>
      assertImageSource({ type: "image/jpeg", size: MAX_IMAGE_SOURCE_BYTES })
    );
    assert.throws(
      () => assertImageSource({ type: "image/jpeg", size: MAX_IMAGE_SOURCE_BYTES + 1 }),
      { message: IMAGE_ERROR_TOO_LARGE }
    );
    assert.throws(
      () => assertImageSource({ type: "image/gif", size: 100 }),
      { message: IMAGE_ERROR_UNSUPPORTED }
    );
  });
});

describe("product full image 1600 long edge", () => {
  it("resizes down to 1600 on the long edge without cropping", () => {
    assert.equal(PRODUCT_FULL_MAX_LONG_EDGE, 1600);
    assert.deepEqual(productFullImageSize(4000, 3000), { width: 1600, height: 1200 });
    assert.deepEqual(fitWithinLongEdge(2000, 1000, 1600), { width: 1600, height: 800 });
  });

  it("does not upscale", () => {
    assert.deepEqual(productFullImageSize(800, 600), { width: 800, height: 600 });
    assert.deepEqual(fitWithinLongEdge(400, 800, 1600), { width: 400, height: 800 });
  });
});

describe("product thumbnail 400 width", () => {
  it("keeps ~400px width behavior without upscale or crop", () => {
    assert.equal(PRODUCT_THUMBNAIL_MAX_WIDTH, 400);
    assert.deepEqual(productThumbnailSize(200, 150), { width: 200, height: 150 });
    assert.deepEqual(productThumbnailSize(800, 1200), { width: 400, height: 600 });
    assert.deepEqual(productThumbnailSize(2000, 1000), { width: 400, height: 200 });
  });
});

describe("webp output paths", () => {
  it("uses webp extensions and distinct full vs thumb paths", () => {
    assert.equal(PRODUCT_IMAGE_QUALITY, 0.82);
    const rid = "11111111-1111-1111-1111-111111111111";
    const paths = buildProductImageObjectPaths(rid, "1700000000000-abc123xyz", "webp", "webp");
    assert.equal(paths.original, `restaurants/${rid}/products/1700000000000-abc123xyz.webp`);
    assert.equal(paths.thumbnail, `restaurants/${rid}/products/1700000000000-abc123xyz-thumb.webp`);
    assert.notEqual(paths.original, paths.thumbnail);
  });
});

describe("public card fallback", () => {
  it("uses thumbnail_url when present and image_url when missing", () => {
    assert.equal(
      resolvePublicProductCardImageSrc({
        thumbnail_url: "https://cdn.example/thumb.webp",
        image_url: "https://cdn.example/full.webp",
      }),
      "https://cdn.example/thumb.webp"
    );
    assert.equal(
      resolvePublicProductCardImageSrc({
        thumbnail_url: "",
        image_url: "https://cdn.example/legacy.jpg",
      }),
      "https://cdn.example/legacy.jpg"
    );
  });
});
