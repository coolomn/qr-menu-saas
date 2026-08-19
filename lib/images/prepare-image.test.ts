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
  fitWithinMaxWidth,
  isAllowedImageMime,
  pickBudgetedEncodeResult,
  runBudgetedWidthQualityEncode,
  welcomeWidthLadder,
} from "./prepare-image";
import {
  PRODUCT_FULL_MAX_LONG_EDGE,
  PRODUCT_IMAGE_QUALITY,
  PRODUCT_THUMBNAIL_MAX_WIDTH,
  WELCOME_BACKGROUND_MAX_OUTPUT_BYTES,
  WELCOME_BACKGROUND_MAX_WIDTH,
  WELCOME_BACKGROUND_QUALITY,
  WELCOME_BACKGROUND_QUALITY_STEPS,
  WELCOME_BACKGROUND_TARGET_BYTES,
  WELCOME_BACKGROUND_WIDTH_STEPS,
  buildProductImageObjectPaths,
  buildWelcomeBackgroundObjectPath,
  productFullImageSize,
  productThumbnailSize,
  welcomeBackgroundImageSize,
} from "./prepare-presets";
import {
  publicBackgroundStoragePathFromUrl,
  publicProductStoragePathFromUrl,
  resolvePublicProductCardImageSrc,
} from "@/lib/public-menu/product-image-urls";

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

describe("welcome background 1920 width", () => {
  it("resizes by width without crop or upscale", () => {
    assert.equal(WELCOME_BACKGROUND_MAX_WIDTH, 1920);
    assert.equal(WELCOME_BACKGROUND_QUALITY, 0.82);
    assert.deepEqual(welcomeBackgroundImageSize(3840, 2160), { width: 1920, height: 1080 });
    assert.deepEqual(welcomeBackgroundImageSize(1200, 1800), { width: 1200, height: 1800 });
  });

  it("lowers quality before shrinking width, without upscale", () => {
    assert.deepEqual([...WELCOME_BACKGROUND_QUALITY_STEPS], [0.82, 0.78, 0.74, 0.7, 0.65, 0.6]);
    assert.deepEqual([...WELCOME_BACKGROUND_WIDTH_STEPS], [1920, 1600, 1440, 1280, 1080]);
    assert.equal(WELCOME_BACKGROUND_TARGET_BYTES, 1024 * 1024);
    assert.equal(WELCOME_BACKGROUND_MAX_OUTPUT_BYTES, Math.round(1.5 * 1024 * 1024));
    assert.deepEqual(welcomeWidthLadder(4000, [...WELCOME_BACKGROUND_WIDTH_STEPS]), [
      1920, 1600, 1440, 1280, 1080,
    ]);
    assert.deepEqual(welcomeWidthLadder(1800, [...WELCOME_BACKGROUND_WIDTH_STEPS]), [
      1800, 1600, 1440, 1280, 1080,
    ]);
    assert.deepEqual(welcomeWidthLadder(1500, [...WELCOME_BACKGROUND_WIDTH_STEPS]), [
      1500, 1440, 1280, 1080,
    ]);
    assert.deepEqual(welcomeWidthLadder(1200, [...WELCOME_BACKGROUND_WIDTH_STEPS]), [1200, 1080]);
    assert.deepEqual(welcomeWidthLadder(900, [...WELCOME_BACKGROUND_WIDTH_STEPS]), [900]);
  });

  it("stops at ideal size and otherwise keeps the highest quality under the hard limit", () => {
    const mb = 1024 * 1024;
    const firstHitsTarget = pickBudgetedEncodeResult(
      [
        [
          { quality: 0.82, bytes: Math.round(1.2 * mb) },
          { quality: 0.78, bytes: Math.round(0.9 * mb) },
        ],
      ],
      WELCOME_BACKGROUND_TARGET_BYTES,
      WELCOME_BACKGROUND_MAX_OUTPUT_BYTES
    );
    assert.equal(firstHitsTarget?.quality, 0.78);

    const keepHighQualityUnderHard = pickBudgetedEncodeResult(
      [
        [
          { quality: 0.82, bytes: Math.round(1.3 * mb) },
          { quality: 0.78, bytes: Math.round(1.2 * mb) },
          { quality: 0.74, bytes: Math.round(1.15 * mb) },
          { quality: 0.7, bytes: Math.round(1.1 * mb) },
        ],
      ],
      WELCOME_BACKGROUND_TARGET_BYTES,
      WELCOME_BACKGROUND_MAX_OUTPUT_BYTES
    );
    assert.equal(keepHighQualityUnderHard?.quality, 0.82);

    const shrinkAfterHardLimit = pickBudgetedEncodeResult(
      [
        [
          { quality: 0.82, bytes: Math.round(2.2 * mb) },
          { quality: 0.7, bytes: Math.round(1.7 * mb) },
        ],
        [{ quality: 0.82, bytes: Math.round(0.95 * mb) }],
      ],
      WELCOME_BACKGROUND_TARGET_BYTES,
      WELCOME_BACKGROUND_MAX_OUTPUT_BYTES
    );
    assert.equal(shrinkAfterHardLimit?.bytes, Math.round(0.95 * mb));

    const below1440 = pickBudgetedEncodeResult(
      [
        [{ quality: 0.6, bytes: Math.round(2.4 * mb), maxWidth: 1920 }],
        [{ quality: 0.6, bytes: Math.round(2.0 * mb), maxWidth: 1600 }],
        [{ quality: 0.6, bytes: Math.round(1.7 * mb), maxWidth: 1440 }],
        [{ quality: 0.6, bytes: Math.round(1.4 * mb), maxWidth: 1280 }],
      ],
      WELCOME_BACKGROUND_TARGET_BYTES,
      WELCOME_BACKGROUND_MAX_OUTPUT_BYTES
    );
    const lastResortOverPreferred = pickBudgetedEncodeResult(
      [
        [
          { quality: 0.82, bytes: Math.round(3.2 * mb), maxWidth: 1920 },
          { quality: 0.6, bytes: Math.round(2.4 * mb), maxWidth: 1920 },
        ],
        [
          { quality: 0.82, bytes: Math.round(2.8 * mb), maxWidth: 1440 },
          { quality: 0.6, bytes: Math.round(2.1 * mb), maxWidth: 1440 },
        ],
        [
          { quality: 0.82, bytes: Math.round(2.4 * mb), maxWidth: 1080 },
          { quality: 0.6, bytes: Math.round(1.8 * mb), maxWidth: 1080 },
        ],
      ],
      WELCOME_BACKGROUND_TARGET_BYTES,
      WELCOME_BACKGROUND_MAX_OUTPUT_BYTES
    );
    assert.equal(lastResortOverPreferred?.maxWidth, 1080);
    assert.equal(lastResortOverPreferred?.quality, 0.6);
    assert.ok((lastResortOverPreferred?.bytes ?? 0) > WELCOME_BACKGROUND_MAX_OUTPUT_BYTES);
  });

  it("retries the next width after a canvas/memory encode failure", async () => {
    const picked = await runBudgetedWidthQualityEncode({
      sourceWidth: 4000,
      sourceHeight: 3000,
      widthSteps: [...WELCOME_BACKGROUND_WIDTH_STEPS],
      qualitySteps: [...WELCOME_BACKGROUND_QUALITY_STEPS],
      targetBytes: WELCOME_BACKGROUND_TARGET_BYTES,
      hardLimitBytes: WELCOME_BACKGROUND_MAX_OUTPUT_BYTES,
      encode: async (size, quality) => {
        if (size.width > 1280) throw new Error("canvas oom");
        const bytes = size.width === 1280 && quality <= 0.6 ? 900_000 : 2_000_000;
        return { bytes, value: { width: size.width, height: size.height, quality, bytes } };
      },
    });
    assert.ok(picked);
    assert.equal(picked.width, 1280);
    assert.ok(picked.width < 1440);
    assert.equal(picked.height, 960);
    assert.ok(picked.bytes <= WELCOME_BACKGROUND_MAX_OUTPUT_BYTES);
    assert.ok(Math.abs(picked.width / picked.height - 4000 / 3000) < 0.01);
  });

  it("accepts the last successful 1080 / q0.60 encode when still over 1.5 MB", async () => {
    const picked = await runBudgetedWidthQualityEncode({
      sourceWidth: 4000,
      sourceHeight: 2667,
      widthSteps: [...WELCOME_BACKGROUND_WIDTH_STEPS],
      qualitySteps: [...WELCOME_BACKGROUND_QUALITY_STEPS],
      targetBytes: WELCOME_BACKGROUND_TARGET_BYTES,
      hardLimitBytes: WELCOME_BACKGROUND_MAX_OUTPUT_BYTES,
      encode: async (size, quality) => {
        const bytes = 2_200_000 - Math.round((1920 - size.width) * 200) - Math.round((0.82 - quality) * 80_000);
        return { bytes, value: { width: size.width, height: size.height, quality, bytes } };
      },
    });
    assert.ok(picked);
    assert.equal(picked.width, 1080);
    assert.equal(picked.quality, 0.6);
    assert.ok(picked.bytes > WELCOME_BACKGROUND_MAX_OUTPUT_BYTES);
    assert.ok(Math.abs(picked.width / picked.height - 4000 / 2667) < 0.01);
  });

  it("encodes a 12–13 MB high-detail JPEG without rejecting on output size", async () => {
    const sharp = (await import("sharp")).default;
    const { randomFillSync } = await import("node:crypto");
    const width = 5200;
    const height = 3467;
    const raw = Buffer.alloc(width * height * 3);
    randomFillSync(raw);
    let source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
    let quality = 92;
    while (source.length > 13 * 1024 * 1024 && quality > 40) {
      quality -= 4;
      source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
    }
    while (source.length < 12 * 1024 * 1024 && quality < 98) {
      quality += 2;
      const next = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality }).toBuffer();
      if (next.length > 19 * 1024 * 1024) break;
      source = next;
    }
    assert.ok(source.length <= MAX_IMAGE_SOURCE_BYTES);
    assert.ok(source.length >= 12 * 1024 * 1024, `expected ~12–13 MB source, got ${source.length}`);

    const picked = await runBudgetedWidthQualityEncode({
      sourceWidth: width,
      sourceHeight: height,
      widthSteps: [...WELCOME_BACKGROUND_WIDTH_STEPS],
      qualitySteps: [...WELCOME_BACKGROUND_QUALITY_STEPS],
      targetBytes: WELCOME_BACKGROUND_TARGET_BYTES,
      hardLimitBytes: WELCOME_BACKGROUND_MAX_OUTPUT_BYTES,
      encode: async (size, q) => {
        const buffer = await sharp(source)
          .resize({ width: size.width, withoutEnlargement: true })
          .webp({ quality: Math.round(q * 100) })
          .toBuffer();
        return {
          bytes: buffer.length,
          value: { width: size.width, height: size.height, quality: q, bytes: buffer.length },
        };
      },
    });

    assert.ok(picked, "valid JPEG under 20 MB must not be rejected after successful encode");
    assert.ok(picked.width <= 1920);
    const expected = fitWithinMaxWidth(width, height, picked.width);
    assert.deepEqual({ width: picked.width, height: picked.height }, expected);
    assert.ok(Math.abs(picked.width / picked.height - width / height) < 0.01);
    process.stdout.write(
      `\n[welcome-12mb] sourceBytes=${source.length} finalBytes=${picked.bytes} width=${picked.width} quality=${picked.quality}\n`
    );
  });

  it("uses versioned background path distinct from products", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    const path = buildWelcomeBackgroundObjectPath(rid, "1700000000000-abc123xyz", "webp");
    assert.equal(path, `restaurants/${rid}/background/1700000000000-abc123xyz.webp`);
    const product = buildProductImageObjectPaths(rid, "1700000000000-abc123xyz", "webp", "webp");
    assert.notEqual(path, product.original);
  });
});

describe("background storage path guard", () => {
  it("only allows this restaurant's background objects", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    const other = "22222222-2222-2222-2222-222222222222";
    const bg = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/background/old.webp`;
    assert.equal(
      publicBackgroundStoragePathFromUrl(bg, rid),
      `restaurants/${rid}/background/old.webp`
    );
    assert.equal(publicBackgroundStoragePathFromUrl(bg, other), null);
    assert.equal(
      publicBackgroundStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/products/x.webp`,
        rid
      ),
      null
    );
    assert.equal(
      publicProductStoragePathFromUrl(bg, rid),
      null
    );
    assert.equal(
      publicBackgroundStoragePathFromUrl(
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934",
        rid
      ),
      null
    );
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
