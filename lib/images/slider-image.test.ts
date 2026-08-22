import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SLIDER_MAX_OUTPUT_BYTES,
  SLIDER_MAX_WIDTH,
  SLIDER_QUALITY_STEPS,
  SLIDER_TARGET_BYTES,
  SLIDER_WIDTH_STEPS,
  buildSliderImageObjectPath,
  sliderImageSize,
} from "./prepare-presets";
import {
  MAX_IMAGE_SOURCE_BYTES,
  ensurePreparedImageMimeConsistency,
  fitWithinMaxWidth,
  runBudgetedWidthQualityEncode,
  sniffBlobImageFormat,
} from "./prepare-image";
import { ImagePrepareError } from "./errors";
import { publicSliderStoragePathFromUrl } from "../public-menu/product-image-urls";

describe("sliderImageSize", () => {
  it("does not upscale and preserves aspect ratio", () => {
    assert.deepEqual(sliderImageSize(1600, 900), { width: 1600, height: 900 });
    assert.deepEqual(sliderImageSize(4000, 2250), { width: 1920, height: 1080 });
    assert.deepEqual(sliderImageSize(800, 1200), { width: 800, height: 1200 });
  });

  it("caps width at SLIDER_MAX_WIDTH", () => {
    assert.equal(SLIDER_MAX_WIDTH, 1920);
    const sized = sliderImageSize(5000, 2813);
    assert.equal(sized.width, 1920);
    assert.ok(Math.abs(sized.width / sized.height - 5000 / 2813) < 0.01);
  });
});

describe("slider budget encode", () => {
  it("prefers the highest quality result under target bytes", async () => {
    const picked = await runBudgetedWidthQualityEncode({
      sourceWidth: 4000,
      sourceHeight: 2250,
      widthSteps: [...SLIDER_WIDTH_STEPS],
      qualitySteps: [...SLIDER_QUALITY_STEPS],
      targetBytes: SLIDER_TARGET_BYTES,
      hardLimitBytes: SLIDER_MAX_OUTPUT_BYTES,
      encode: async (size, quality) => {
        const bytes =
          700_000 - Math.round((1920 - size.width) * 120) - Math.round((0.82 - quality) * 40_000);
        return { bytes, value: { width: size.width, height: size.height, quality, bytes } };
      },
    });
    assert.ok(picked);
    assert.ok(picked.bytes <= SLIDER_TARGET_BYTES);
    assert.equal(picked.quality, 0.82);
  });

  it("does not hard-reject when still above target but returns best effort", async () => {
    const picked = await runBudgetedWidthQualityEncode({
      sourceWidth: 4000,
      sourceHeight: 2250,
      widthSteps: [...SLIDER_WIDTH_STEPS],
      qualitySteps: [...SLIDER_QUALITY_STEPS],
      targetBytes: SLIDER_TARGET_BYTES,
      hardLimitBytes: SLIDER_MAX_OUTPUT_BYTES,
      encode: async (size, quality) => {
        const bytes = 1_100_000 - Math.round((1920 - size.width) * 50);
        return { bytes, value: { width: size.width, height: size.height, quality, bytes } };
      },
    });
    assert.ok(picked);
    assert.ok(picked.bytes > SLIDER_TARGET_BYTES);
    assert.ok(picked.bytes <= SLIDER_MAX_OUTPUT_BYTES || picked.width === 1280);
  });

  it("accepts last successful encode when still over preferred max", async () => {
    const picked = await runBudgetedWidthQualityEncode({
      sourceWidth: 4000,
      sourceHeight: 2667,
      widthSteps: [...SLIDER_WIDTH_STEPS],
      qualitySteps: [...SLIDER_QUALITY_STEPS],
      targetBytes: SLIDER_TARGET_BYTES,
      hardLimitBytes: SLIDER_MAX_OUTPUT_BYTES,
      encode: async (size, quality) => {
        const bytes = 1_200_000 - Math.round((1920 - size.width) * 40);
        return { bytes, value: { width: size.width, height: size.height, quality, bytes } };
      },
    });
    assert.ok(picked);
    assert.equal(picked.width, 1280);
    assert.equal(picked.quality, 0.65);
    assert.ok(picked.bytes > SLIDER_MAX_OUTPUT_BYTES);
  });
});

describe("slider storage path", () => {
  it("builds versioned slider webp paths", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    assert.equal(
      buildSliderImageObjectPath(rid, "1700000000000-abc", "webp"),
      `restaurants/${rid}/slider/1700000000000-abc.webp`
    );
  });

  it("only allows this restaurant's slider objects for cleanup", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    const other = "22222222-2222-2222-2222-222222222222";
    const url = `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/slider/old.webp`;
    assert.equal(
      publicSliderStoragePathFromUrl(url, rid),
      `restaurants/${rid}/slider/old.webp`
    );
    assert.equal(publicSliderStoragePathFromUrl(url, other), null);
    assert.equal(
      publicSliderStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/background/x.webp`,
        rid
      ),
      null
    );
    assert.equal(
      publicSliderStoragePathFromUrl(
        `https://proj.supabase.co/storage/v1/object/public/menu-public/restaurants/${other}/slider/x.webp`,
        rid
      ),
      null
    );
  });

  it("keeps legacy JPG slider URLs outside storage guard (no path parse)", () => {
    const rid = "11111111-1111-1111-1111-111111111111";
    assert.equal(
      publicSliderStoragePathFromUrl("https://cdn.example.com/legacy-slider.jpg", rid),
      null
    );
  });
});

describe("slider source limits", () => {
  it("allows sources up to 20 MB at pipeline entry", () => {
    assert.equal(MAX_IMAGE_SOURCE_BYTES, 20 * 1024 * 1024);
    const landscape = fitWithinMaxWidth(5200, 3467, SLIDER_MAX_WIDTH);
    assert.equal(landscape.width, 1920);
    assert.ok(landscape.height < landscape.width);
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

describe("slider prepared image MIME alignment", () => {
  const rid = "11111111-1111-1111-1111-111111111111";

  it("maps webp blob to .webp extension and image/webp content type", async () => {
    const blob = mockImageBlob("webp", "image/png");
    assert.equal(await sniffBlobImageFormat(blob), "webp");

    const aligned = await ensurePreparedImageMimeConsistency({
      blob,
      contentType: "image/webp",
      ext: "webp",
    });

    assert.equal(aligned.ext, "webp");
    assert.equal(aligned.contentType, "image/webp");
    assert.equal(aligned.blob.type, "image/webp");
    assert.equal(
      buildSliderImageObjectPath(rid, "1700000000000-abc", aligned.ext),
      `restaurants/${rid}/slider/1700000000000-abc.webp`
    );
  });

  it("maps jpeg fallback to .jpg extension and image/jpeg content type", async () => {
    const blob = mockImageBlob("jpeg");
    assert.equal(await sniffBlobImageFormat(blob), "jpeg");

    const aligned = await ensurePreparedImageMimeConsistency({
      blob,
      contentType: "image/jpeg",
      ext: "jpg",
    });

    assert.equal(aligned.ext, "jpg");
    assert.equal(aligned.contentType, "image/jpeg");
    assert.equal(aligned.blob.type, "image/jpeg");
    assert.equal(
      buildSliderImageObjectPath(rid, "1700000000000-abc", aligned.ext),
      `restaurants/${rid}/slider/1700000000000-abc.jpg`
    );
  });

  it("rejects png payload mislabeled as webp", async () => {
    const blob = mockImageBlob("png", "image/png");
    await assert.rejects(
      () =>
        ensurePreparedImageMimeConsistency({
          blob,
          contentType: "image/webp",
          ext: "webp",
        }),
      (error: unknown) => error instanceof ImagePrepareError
    );
  });
});
