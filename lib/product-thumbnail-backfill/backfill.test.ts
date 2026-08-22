import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import sharp from "sharp";
import {
  applyThumbnailBackfillLimit,
  assertTenantProductThumbPath,
  filterThumbnailBackfillEligible,
  isThumbnailBackfillEligible,
  parseThumbnailBackfillArgs,
} from "./eligibility";
import {
  createDefaultUniqueId,
  formatThumbnailBackfillReport,
  processOneThumbnailBackfill,
  runProductThumbnailBackfill,
  uploadedThumbBelongsToRestaurant,
  type ThumbnailBackfillDeps,
  type ThumbnailBackfillProduct,
} from "./run";
import { buildProductImageObjectPaths } from "@/lib/images/prepare-presets";

function product(
  partial: Partial<ThumbnailBackfillProduct> & Pick<ThumbnailBackfillProduct, "id">
): ThumbnailBackfillProduct {
  return {
    restaurant_id: partial.restaurant_id || "rest-1",
    image_url: partial.image_url ?? null,
    thumbnail_url: partial.thumbnail_url ?? null,
    id: partial.id,
  };
}

let sampleJpeg: Buffer;

before(async () => {
  sampleJpeg = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 180, g: 90, b: 40 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
});

describe("thumbnail backfill eligibility", () => {
  it("requires image_url and empty thumbnail_url", () => {
    assert.equal(
      isThumbnailBackfillEligible(
        product({ id: "1", image_url: "https://cdn.example/a.jpg", thumbnail_url: "" })
      ),
      true
    );
    assert.equal(
      isThumbnailBackfillEligible(
        product({
          id: "2",
          image_url: "https://cdn.example/a.jpg",
          thumbnail_url: "https://cdn.example/a-thumb.webp",
        })
      ),
      false
    );
    assert.equal(
      isThumbnailBackfillEligible(product({ id: "3", image_url: "", thumbnail_url: "" })),
      false
    );
  });

  it("filters eligible rows", () => {
    const rows = [
      product({ id: "a", image_url: "https://x/a.jpg", thumbnail_url: "" }),
      product({ id: "b", image_url: "https://x/b.jpg", thumbnail_url: "https://x/b-thumb.webp" }),
      product({ id: "c", image_url: null, thumbnail_url: null }),
    ];
    assert.deepEqual(
      filterThumbnailBackfillEligible(rows).map((r) => r.id),
      ["a"]
    );
  });
});

describe("CLI args", () => {
  it("parses dry-run, limit, restaurant filter", () => {
    const opts = parseThumbnailBackfillArgs([
      "--dry-run",
      "--limit=5",
      "--restaurant-id=rest-9",
      "--concurrency=3",
    ]);
    assert.equal(opts.dryRun, true);
    assert.equal(opts.limit, 5);
    assert.equal(opts.restaurantId, "rest-9");
    assert.equal(opts.concurrency, 3);
  });

  it("applies limit", () => {
    assert.deepEqual(applyThumbnailBackfillLimit([1, 2, 3, 4], 2), [1, 2]);
    assert.deepEqual(applyThumbnailBackfillLimit([1, 2], null), [1, 2]);
  });
});

describe("tenant path guard", () => {
  it("accepts versioned thumb paths under restaurants/{id}/products/", () => {
    const paths = buildProductImageObjectPaths("rest-1", "1700000000000-abc", "jpg", "webp");
    assert.doesNotThrow(() => assertTenantProductThumbPath("rest-1", paths.thumbnail));
  });

  it("rejects other tenants and non-thumb paths", () => {
    assert.throws(() =>
      assertTenantProductThumbPath("rest-1", "restaurants/rest-2/products/x-thumb.webp")
    );
    assert.throws(() =>
      assertTenantProductThumbPath("rest-1", "restaurants/rest-1/products/x.webp")
    );
  });

  it("validates public thumb URLs belong to restaurant", () => {
    const rid = "98dc9d93-9005-40fd-9db5-5e4c63b36f1b";
    const ok = `https://example.supabase.co/storage/v1/object/public/menu-public/restaurants/${rid}/products/1-thumb.webp`;
    const bad = `https://example.supabase.co/storage/v1/object/public/menu-public/restaurants/other/products/1-thumb.webp`;
    assert.equal(uploadedThumbBelongsToRestaurant(ok, rid), true);
    assert.equal(uploadedThumbBelongsToRestaurant(bad, rid), false);
  });
});

describe("processOneThumbnailBackfill", () => {
  it("dry-run plans without upload or DB mutation", async () => {
    let uploads = 0;
    let updates = 0;
    const deps: ThumbnailBackfillDeps = {
      listCandidateProducts: async () => [],
      listRestaurants: async () => [],
      downloadImage: async () => {
        throw new Error("should not download");
      },
      uploadThumbnail: async () => {
        uploads += 1;
        return { ok: true };
      },
      updateThumbnailUrl: async () => {
        updates += 1;
        return { ok: true };
      },
      removeStoragePath: async () => {},
      publicUrlForPath: (path) => `https://cdn.example/${path}`,
      newUniqueId: () => "uid-1",
    };

    const result = await processOneThumbnailBackfill(
      product({ id: "p1", image_url: "https://cdn.example/a.jpg", thumbnail_url: "" }),
      deps,
      { dryRun: true }
    );
    assert.equal(result.status, "planned");
    assert.equal(uploads, 0);
    assert.equal(updates, 0);
  });

  it("skips products that already have thumbnails", async () => {
    const result = await processOneThumbnailBackfill(
      product({
        id: "p1",
        image_url: "https://cdn.example/a.jpg",
        thumbnail_url: "https://cdn.example/a-thumb.webp",
      }),
      {
        listCandidateProducts: async () => [],
        listRestaurants: async () => [],
        downloadImage: async () => sampleJpeg,
        uploadThumbnail: async () => ({ ok: true }),
        updateThumbnailUrl: async () => ({ ok: true }),
        removeStoragePath: async () => {},
        publicUrlForPath: (p) => p,
        newUniqueId: createDefaultUniqueId,
      },
      { dryRun: false }
    );
    assert.equal(result.status, "skipped");
  });

  it("uploads thumb and updates only thumbnail_url", async () => {
    const imageUrl = "https://cdn.example/a.jpg";
    let updatedFields: Record<string, string> | null = null;
    let uploadedPath = "";

    const deps: ThumbnailBackfillDeps = {
      listCandidateProducts: async () => [],
      listRestaurants: async () => [],
      downloadImage: async (url) => {
        assert.equal(url, imageUrl);
        return sampleJpeg;
      },
      uploadThumbnail: async ({ path, body, contentType }) => {
        uploadedPath = path;
        assert.match(path, /^restaurants\/rest-1\/products\/.+-thumb\.webp$/);
        assert.equal(contentType, "image/webp");
        assert.ok(body.length > 0);
        return { ok: true };
      },
      updateThumbnailUrl: async ({ productId, thumbnailUrl, expectedImageUrl }) => {
        assert.equal(productId, "p1");
        assert.equal(expectedImageUrl, imageUrl);
        updatedFields = { thumbnail_url: thumbnailUrl };
        assert.equal("image_url" in updatedFields, false);
        return { ok: true };
      },
      removeStoragePath: async () => {
        throw new Error("should not cleanup on success");
      },
      publicUrlForPath: (path) =>
        `https://example.supabase.co/storage/v1/object/public/menu-public/${path}`,
      newUniqueId: () => "1700000000000-testuid",
    };

    const result = await processOneThumbnailBackfill(
      product({ id: "p1", image_url: imageUrl, thumbnail_url: "" }),
      deps,
      { dryRun: false }
    );
    assert.equal(result.status, "processed");
    if (result.status === "processed") {
      assert.equal(result.path, uploadedPath);
      assert.match(result.thumbnailUrl, /-thumb\.webp/);
    }
    assert.ok(updatedFields?.thumbnail_url);
  });

  it("best-effort removes uploaded thumb when DB update fails", async () => {
    const removed: string[] = [];
    const deps: ThumbnailBackfillDeps = {
      listCandidateProducts: async () => [],
      listRestaurants: async () => [],
      downloadImage: async () => sampleJpeg,
      uploadThumbnail: async () => ({ ok: true }),
      updateThumbnailUrl: async () => ({ ok: false, error: "db down" }),
      removeStoragePath: async (path) => {
        removed.push(path);
      },
      publicUrlForPath: (path) => `https://cdn.example/${path}`,
      newUniqueId: () => "uid-fail",
    };

    const result = await processOneThumbnailBackfill(
      product({ id: "p-fail", image_url: "https://cdn.example/a.jpg", thumbnail_url: "" }),
      deps,
      { dryRun: false }
    );
    assert.equal(result.status, "failed");
    assert.equal(removed.length, 1);
    assert.match(removed[0], /-thumb\.webp$/);
  });

  it("continues batch when one product fails", async () => {
    const deps: ThumbnailBackfillDeps = {
      listCandidateProducts: async () => [
        product({ id: "bad", image_url: "https://cdn.example/bad.jpg", thumbnail_url: "" }),
        product({ id: "good", image_url: "https://cdn.example/good.jpg", thumbnail_url: "" }),
      ],
      listRestaurants: async () => [{ id: "rest-1", name: "Demo", slug: "demo" }],
      downloadImage: async (url) => {
        if (url.includes("bad")) throw new Error("download fail");
        return sampleJpeg;
      },
      uploadThumbnail: async () => ({ ok: true }),
      updateThumbnailUrl: async () => ({ ok: true }),
      removeStoragePath: async () => {},
      publicUrlForPath: (path) => `https://cdn.example/${path}`,
      newUniqueId: () => `uid-${Math.random().toString(16).slice(2)}`,
    };

    const result = await runProductThumbnailBackfill(
      { dryRun: false, limit: null, restaurantId: null, concurrency: 2 },
      deps
    );
    assert.equal(result.eligible, 2);
    assert.equal(result.processed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.failures[0]?.productId, "bad");
  });
});

describe("runProductThumbnailBackfill dry-run + filters", () => {
  it("reports restaurant breakdown and respects limit without mutations", async () => {
    let uploads = 0;
    const deps: ThumbnailBackfillDeps = {
      listCandidateProducts: async ({ restaurantId }) => {
        const all = [
          product({
            id: "d1",
            restaurant_id: "r-didim",
            image_url: "https://cdn.example/d1.jpg",
            thumbnail_url: "",
          }),
          product({
            id: "d2",
            restaurant_id: "r-didim",
            image_url: "https://cdn.example/d2.jpg",
            thumbnail_url: "",
          }),
          product({
            id: "b1",
            restaurant_id: "r-blue",
            image_url: "https://cdn.example/b1.jpg",
            thumbnail_url: "",
          }),
          product({
            id: "skip",
            restaurant_id: "r-didim",
            image_url: "https://cdn.example/s.jpg",
            thumbnail_url: "https://cdn.example/s-thumb.webp",
          }),
        ];
        return restaurantId ? all.filter((p) => p.restaurant_id === restaurantId) : all;
      },
      listRestaurants: async () => [
        { id: "r-didim", name: "Didim Yacht Club", slug: "didim-yacht-club" },
        { id: "r-blue", name: "Blue Point Beach Club", slug: "blue-point-beach-club" },
      ],
      downloadImage: async () => {
        throw new Error("no download in dry-run");
      },
      uploadThumbnail: async () => {
        uploads += 1;
        return { ok: true };
      },
      updateThumbnailUrl: async () => ({ ok: true }),
      removeStoragePath: async () => {},
      publicUrlForPath: (p) => p,
      newUniqueId: createDefaultUniqueId,
    };

    const result = await runProductThumbnailBackfill(
      { dryRun: true, limit: 2, restaurantId: null, concurrency: 2 },
      deps
    );
    assert.equal(result.dryRun, true);
    assert.equal(result.eligible, 3);
    assert.equal(result.planned.length, 2);
    assert.equal(result.processed, 0);
    assert.equal(uploads, 0);
    assert.equal(result.byRestaurant.find((r) => r.slug === "didim-yacht-club")?.eligible, 2);

    const filtered = await runProductThumbnailBackfill(
      { dryRun: true, limit: null, restaurantId: "r-blue", concurrency: 1 },
      deps
    );
    assert.equal(filtered.eligible, 1);
    assert.equal(filtered.planned[0]?.productId, "b1");

    const report = formatThumbnailBackfillReport(result);
    assert.match(report, /DRY RUN/);
    assert.match(report, /Didim Yacht Club/);
  });
});
