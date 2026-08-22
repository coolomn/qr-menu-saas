import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMAGE_CROP_FAILED_MESSAGE,
  MENU_COLLECTION_CROP_MAX_OUTPUT_EDGE,
  resolveSquareCropOutputSize,
  validateImageSourceFile,
} from "./crop-image";
import { MAX_IMAGE_SOURCE_BYTES } from "./prepare-image";

describe("resolveSquareCropOutputSize", () => {
  it("does not upscale small crops", () => {
    assert.deepEqual(resolveSquareCropOutputSize(320, 320), { width: 320, height: 320 });
    assert.deepEqual(resolveSquareCropOutputSize(400, 400), { width: 400, height: 400 });
  });

  it("caps large square crops at MENU_COLLECTION_CROP_MAX_OUTPUT_EDGE", () => {
    assert.equal(MENU_COLLECTION_CROP_MAX_OUTPUT_EDGE, 1200);
    assert.deepEqual(resolveSquareCropOutputSize(3000, 3000), {
      width: 1200,
      height: 1200,
    });
  });

  it("preserves aspect ratio when crop is not perfectly square", () => {
    assert.deepEqual(resolveSquareCropOutputSize(2400, 1200), {
      width: 1200,
      height: 600,
    });
  });
});

describe("validateImageSourceFile", () => {
  it("accepts jpeg/png/webp under 20 MB", () => {
    assert.equal(
      validateImageSourceFile({
        type: "image/jpeg",
        size: MAX_IMAGE_SOURCE_BYTES,
      } as File),
      null
    );
    assert.equal(
      validateImageSourceFile({ type: "image/png", size: 1024 } as File),
      null
    );
    assert.equal(
      validateImageSourceFile({ type: "image/webp", size: 1024 } as File),
      null
    );
  });

  it("rejects unsupported formats and oversize sources", () => {
    assert.match(
      validateImageSourceFile({ type: "image/gif", size: 1024 } as File) ?? "",
      /Desteklenmeyen format/
    );
    assert.match(
      validateImageSourceFile({
        type: "image/jpeg",
        size: MAX_IMAGE_SOURCE_BYTES + 1,
      } as File) ?? "",
      /20 MB/
    );
  });
});

describe("IMAGE_CROP_FAILED_MESSAGE", () => {
  it("is a clear Turkish fallback message", () => {
    assert.match(IMAGE_CROP_FAILED_MESSAGE, /Görsel kırpılamadı/);
    assert.match(IMAGE_CROP_FAILED_MESSAGE, /JPG, PNG veya WebP/);
  });
});
