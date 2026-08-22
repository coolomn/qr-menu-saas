import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatProductFullUploadError,
  formatProductImageSaveError,
  formatProductThumbPrepareError,
  formatProductThumbUploadError,
  PRODUCT_THUMB_PREPARE_FAILED_MESSAGE,
  sanitizeUploadErrorDetail,
  uploadProductImageAtomic,
  type ProductImageUploadDeps,
} from "./product-image-upload-atomic";
import type { PreparedImage } from "@/lib/images/prepare-image";

function prepared(ext: "webp" | "jpg" | "png", bytes = 32): PreparedImage {
  const contentType =
    ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: contentType }),
    contentType,
    ext,
  };
}

function createDeps(overrides: Partial<ProductImageUploadDeps> = {}): {
  deps: ProductImageUploadDeps;
  uploaded: string[];
  removed: string[];
} {
  const uploaded: string[] = [];
  const removed: string[] = [];
  const deps: ProductImageUploadDeps = {
    prepareFull: async () => prepared("webp", 100),
    prepareThumbnail: async () => prepared("webp", 40),
    uploadObject: async ({ path }) => {
      uploaded.push(path);
      return { ok: true };
    },
    removeObjects: async (paths) => {
      removed.push(...paths);
    },
    publicUrlForPath: (path) =>
      `https://cdn.example/storage/v1/object/public/menu-public/${path}`,
    newUniqueId: () => "1700000000000-testuid",
    ...overrides,
  };
  return { deps, uploaded, removed };
}

describe("sanitizeUploadErrorDetail", () => {
  it("hides opaque Load failed TypeErrors", () => {
    assert.equal(sanitizeUploadErrorDetail("TypeError: Load failed"), null);
    assert.equal(sanitizeUploadErrorDetail("Failed to fetch"), null);
  });

  it("keeps actionable storage messages", () => {
    assert.equal(sanitizeUploadErrorDetail("Bucket not found"), "Bucket not found");
  });
});

describe("product image error messages", () => {
  it("formats Turkish step messages", () => {
    assert.match(formatProductThumbPrepareError("decode"), /küçük görseli oluşturulamadı/);
    assert.equal(formatProductThumbPrepareError("TypeError: Load failed"), PRODUCT_THUMB_PREPARE_FAILED_MESSAGE);
    assert.match(formatProductThumbUploadError("timeout"), /küçük görseli yüklenemedi/);
    assert.match(formatProductFullUploadError("x"), /Ürün görseli yüklenemedi/);
    assert.match(formatProductImageSaveError("db"), /Ürün kaydedilemedi/);
  });
});

describe("uploadProductImageAtomic", () => {
  it("returns both URLs on full + thumb success", async () => {
    const { deps, uploaded, removed } = createDeps();
    const result = await uploadProductImageAtomic("rest-1", new File([], "a.jpg"), deps);
    assert.ok(!("error" in result));
    if ("error" in result) return;
    assert.match(result.url, /\/products\/1700000000000-testuid\.webp$/);
    assert.match(result.thumbnailUrl, /\/products\/1700000000000-testuid-thumb\.webp$/);
    assert.ok(result.thumbnailUrl.trim());
    assert.equal(uploaded.length, 2);
    assert.equal(removed.length, 0);
  });

  it("does not write storage when thumbnail prepare fails", async () => {
    const { deps, uploaded, removed } = createDeps({
      prepareThumbnail: async () => {
        throw new Error("decode failed");
      },
    });
    const result = await uploadProductImageAtomic("rest-1", new File([], "a.jpg"), deps);
    assert.ok("error" in result);
    if (!("error" in result)) return;
    assert.match(result.error, /küçük görseli oluşturulamadı/);
    assert.equal(uploaded.length, 0);
    assert.equal(removed.length, 0);
  });

  it("cleans up full image when thumbnail upload fails", async () => {
    const { deps, uploaded, removed } = createDeps({
      uploadObject: async ({ path }) => {
        uploaded.push(path);
        if (path.includes("-thumb.")) {
          return { ok: false, message: "storage denied" };
        }
        return { ok: true };
      },
    });
    const result = await uploadProductImageAtomic("rest-1", new File([], "a.jpg"), deps);
    assert.ok("error" in result);
    if (!("error" in result)) return;
    assert.match(result.error, /küçük görseli yüklenemedi/);
    assert.equal(uploaded.filter((p) => !p.includes("-thumb.")).length, 1);
    assert.ok(removed.some((p) => p.includes("/products/") && !p.includes("-thumb.")));
  });

  it("never returns image url with empty thumbnail", async () => {
    const { deps } = createDeps({
      publicUrlForPath: (path) =>
        path.includes("-thumb.")
          ? ""
          : `https://cdn.example/storage/v1/object/public/menu-public/${path}`,
    });
    const result = await uploadProductImageAtomic("rest-1", new File([], "a.jpg"), deps);
    assert.ok("error" in result);
  });

  it("hard-fails full prepare before any upload", async () => {
    const { deps, uploaded } = createDeps({
      prepareFull: async () => {
        throw new Error("bad file");
      },
    });
    const result = await uploadProductImageAtomic("rest-1", new File([], "a.jpg"), deps);
    assert.ok("error" in result);
    if (!("error" in result)) return;
    assert.match(result.error, /Ürün görseli hazırlanamadı/);
    assert.equal(uploaded.length, 0);
  });

  it("uses tenant product path convention", async () => {
    const { deps, uploaded } = createDeps();
    await uploadProductImageAtomic("rest-abc", new File([], "a.jpg"), deps);
    assert.ok(uploaded.every((p) => p.startsWith("restaurants/rest-abc/products/")));
  });
});
