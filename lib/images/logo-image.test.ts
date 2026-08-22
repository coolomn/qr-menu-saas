import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LOGO_LONG_EDGE_STEPS,
  LOGO_MAX_LONG_EDGE,
  LOGO_MAX_OUTPUT_BYTES,
  LOGO_QUALITY,
  LOGO_QUALITY_STEPS,
  LOGO_TARGET_BYTES,
  buildLogoImageObjectPath,
  logoImageSize,
} from "./prepare-presets";
import {
  MAX_IMAGE_SOURCE_BYTES,
  assertImageSource,
  ensurePreparedImageMimeConsistency,
  imageDataHasTransparency,
  longEdgeLadder,
  runBudgetedLongEdgeQualityEncode,
  sniffBlobImageFormat,
} from "./prepare-image";
import { publicLogoStoragePathFromUrl } from "../public-menu/product-image-urls";

describe("logoImageSize", () => {
  it("caps long edge at 800 without upscale", () => {
    assert.equal(LOGO_MAX_LONG_EDGE, 800);
    assert.deepEqual(logoImageSize(400, 200), { width: 400, height: 200 });
    assert.deepEqual(logoImageSize(2000, 1000), { width: 800, height: 400 });
    assert.deepEqual(logoImageSize(600, 1200), { width: 400, height: 800 });
  });

  it("preserves aspect ratio", () => {
    const sized = logoImageSize(1600, 900);
    assert.equal(sized.width, 800);
    assert.ok(Math.abs(sized.width / sized.height - 1600 / 900) < 0.01);
  });
});

describe("logo long edge budget", () => {
  it("uses 800 → 640 → 512 ladder without upscaling", () => {
    assert.deepEqual(longEdgeLadder(2000, 1000, [...LOGO_LONG_EDGE_STEPS]), [800, 640, 512]);
    assert.deepEqual(longEdgeLadder(700, 350, [...LOGO_LONG_EDGE_STEPS]), [700, 640, 512]);
    assert.deepEqual(longEdgeLadder(480, 480, [...LOGO_LONG_EDGE_STEPS]), [480]);
  });

  it("does not hard-reject when still above target bytes", async () => {
    const target = LOGO_TARGET_BYTES;
    const preferred = LOGO_MAX_OUTPUT_BYTES;
    const oversized = target + 50_000;
    const result = await runBudgetedLongEdgeQualityEncode({
      sourceWidth: 2000,
      sourceHeight: 1000,
      longEdgeSteps: [...LOGO_LONG_EDGE_STEPS],
      qualitySteps: [...LOGO_QUALITY_STEPS],
      targetBytes: target,
      hardLimitBytes: preferred,
      encode: async () => ({ bytes: oversized, value: "best-effort" }),
    });
    assert.equal(result, "best-effort");
  });

  it("prefers the highest quality result under target bytes", async () => {
    const target = LOGO_TARGET_BYTES;
    const result = await runBudgetedLongEdgeQualityEncode({
      sourceWidth: 2000,
      sourceHeight: 1000,
      longEdgeSteps: [800],
      qualitySteps: [0.86, 0.82],
      targetBytes: target,
      hardLimitBytes: LOGO_MAX_OUTPUT_BYTES,
      encode: async (_size, quality) => ({
        bytes: quality === 0.86 ? target - 1 : target + 1,
        value: quality,
      }),
    });
    assert.equal(result, 0.86);
  });
});

describe("logo transparency detection", () => {
  it("detects alpha below 255 on sampled pixels", () => {
    const data = new Uint8ClampedArray(4 * 4);
    data[3] = 200;
    assert.equal(imageDataHasTransparency(data, 2, 2, 1), true);
  });

  it("returns false for fully opaque pixels", () => {
    const data = new Uint8ClampedArray(4 * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    assert.equal(imageDataHasTransparency(data, 2, 2, 1), false);
  });
});

function mockImageBlob(format: "webp" | "jpeg" | "png", declaredType?: string): Blob {
  const header =
    format === "webp"
      ? new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0])
      : format === "jpeg"
        ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
        : new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const type =
    declaredType ??
    (format === "webp" ? "image/webp" : format === "jpeg" ? "image/jpeg" : "image/png");
  return new Blob([header], { type });
}

describe("logo MIME alignment", () => {
  const rid = "11111111-1111-1111-1111-111111111111";

  it("maps webp blob to .webp and image/webp", async () => {
    const blob = mockImageBlob("webp", "image/png");
    const aligned = await ensurePreparedImageMimeConsistency(
      { blob, contentType: "image/webp", ext: "webp" },
      { allowPng: true }
    );
    assert.equal(aligned.ext, "webp");
    assert.equal(aligned.contentType, "image/webp");
    assert.equal(aligned.blob.type, "image/webp");
    assert.equal(await sniffBlobImageFormat(aligned.blob), "webp");
  });

  it("maps transparent PNG fallback to .png and image/png", async () => {
    const blob = mockImageBlob("png");
    const aligned = await ensurePreparedImageMimeConsistency(
      { blob, contentType: "image/png", ext: "png" },
      { allowPng: true }
    );
    assert.equal(aligned.ext, "png");
    assert.equal(aligned.contentType, "image/png");
    assert.equal(aligned.blob.type, "image/png");
    assert.equal(
      buildLogoImageObjectPath(rid, "1700000000000-abc", aligned.ext),
      `restaurants/${rid}/logo/1700000000000-abc.png`
    );
  });

  it("maps opaque JPEG fallback to .jpg and image/jpeg", async () => {
    const blob = mockImageBlob("jpeg");
    const aligned = await ensurePreparedImageMimeConsistency(
      { blob, contentType: "image/jpeg", ext: "jpg" },
      { allowPng: true }
    );
    assert.equal(aligned.ext, "jpg");
    assert.equal(aligned.contentType, "image/jpeg");
    assert.equal(aligned.blob.type, "image/jpeg");
  });

  it("corrects PNG payload mislabeled as webp to .png extension", async () => {
    const blob = mockImageBlob("png", "image/png");
    const aligned = await ensurePreparedImageMimeConsistency(
      { blob, contentType: "image/webp", ext: "webp" },
      { allowPng: true }
    );
    assert.equal(aligned.ext, "png");
    assert.equal(aligned.contentType, "image/png");
    assert.equal(aligned.blob.type, "image/png");
    assert.notEqual(aligned.ext, "webp");
  });
});

describe("logo storage path guard", () => {
  const rid = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";

  it("builds versioned logo paths with actual extension", () => {
    assert.equal(
      buildLogoImageObjectPath(rid, "1700000000000-abc", "webp"),
      `restaurants/${rid}/logo/1700000000000-abc.webp`
    );
    assert.equal(
      buildLogoImageObjectPath(rid, "1700000000000-abc", "png"),
      `restaurants/${rid}/logo/1700000000000-abc.png`
    );
  });

  it("only allows this restaurant's logo objects for cleanup", () => {
    const webpUrl = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/logo/old.webp`;
    const pngUrl = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/logo/legacy.png`;
    const jpgUrl = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/logo/legacy.jpg`;

    assert.equal(publicLogoStoragePathFromUrl(webpUrl, rid), `restaurants/${rid}/logo/old.webp`);
    assert.equal(publicLogoStoragePathFromUrl(pngUrl, rid), `restaurants/${rid}/logo/legacy.png`);
    assert.equal(publicLogoStoragePathFromUrl(jpgUrl, rid), `restaurants/${rid}/logo/legacy.jpg`);
    assert.equal(publicLogoStoragePathFromUrl(webpUrl, other), null);
    assert.equal(
      publicLogoStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${other}/logo/x.webp`,
        rid
      ),
      null
    );
    assert.equal(
      publicLogoStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/products/x.webp`,
        rid
      ),
      null
    );
  });

  it("keeps external legacy logo URLs outside storage guard", () => {
    assert.equal(
      publicLogoStoragePathFromUrl("https://cdn.example.com/legacy-logo.png", rid),
      null
    );
  });
});

describe("logo source limits", () => {
  it("allows jpeg/png/webp sources up to 20 MB", () => {
    assert.equal(MAX_IMAGE_SOURCE_BYTES, 20 * 1024 * 1024);
    assert.doesNotThrow(() =>
      assertImageSource({ type: "image/png", size: 10 * 1024 * 1024 })
    );
    assert.doesNotThrow(() =>
      assertImageSource({ type: "image/jpeg", size: MAX_IMAGE_SOURCE_BYTES })
    );
    assert.doesNotThrow(() =>
      assertImageSource({ type: "image/webp", size: MAX_IMAGE_SOURCE_BYTES })
    );
  });

  it("uses logo quality and byte targets", () => {
    assert.equal(LOGO_QUALITY, 0.86);
    assert.equal(LOGO_TARGET_BYTES, 250 * 1024);
    assert.equal(LOGO_MAX_OUTPUT_BYTES, 400 * 1024);
  });
});
