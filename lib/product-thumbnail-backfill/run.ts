import {
  applyThumbnailBackfillLimit,
  assertTenantProductThumbPath,
  filterThumbnailBackfillEligible,
  isThumbnailBackfillEligible,
  type ThumbnailBackfillProduct,
} from "@/lib/product-thumbnail-backfill/eligibility";
import { prepareProductThumbnailBuffer } from "@/lib/product-thumbnail-backfill/prepare-thumbnail-node";
import { buildProductImageObjectPaths } from "@/lib/images/prepare-presets";
import { publicProductStoragePathFromUrl } from "@/lib/public-menu/product-image-urls";

export const MENU_PUBLIC_BUCKET = "menu-public";
export const PRODUCT_IMAGE_CACHE_CONTROL = "31536000";
export const DEFAULT_BACKFILL_CONCURRENCY = 2;

export type RestaurantLabel = {
  id: string;
  name: string;
  slug: string | null;
};

export type ThumbnailBackfillDeps = {
  listCandidateProducts: (args: {
    restaurantId: string | null;
  }) => Promise<ThumbnailBackfillProduct[]>;
  listRestaurants: () => Promise<RestaurantLabel[]>;
  downloadImage: (url: string) => Promise<Buffer>;
  uploadThumbnail: (args: {
    restaurantId: string;
    path: string;
    body: Buffer;
    contentType: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateThumbnailUrl: (args: {
    productId: string;
    restaurantId: string;
    thumbnailUrl: string;
    expectedImageUrl: string;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeStoragePath: (path: string) => Promise<void>;
  publicUrlForPath: (path: string) => string;
  newUniqueId: () => string;
  log?: (message: string) => void;
};

export type ThumbnailBackfillFailure = {
  productId: string;
  restaurantId: string;
  reason: string;
};

export type ThumbnailBackfillRestaurantStats = {
  restaurantId: string;
  name: string;
  slug: string | null;
  eligible: number;
  processed: number;
  skipped: number;
  failed: number;
};

export type ThumbnailBackfillResult = {
  dryRun: boolean;
  eligible: number;
  processed: number;
  skipped: number;
  failed: number;
  failures: ThumbnailBackfillFailure[];
  byRestaurant: ThumbnailBackfillRestaurantStats[];
  planned: Array<{
    productId: string;
    restaurantId: string;
    restaurantName: string;
    imageUrl: string;
  }>;
};

export type ThumbnailBackfillRunOptions = {
  dryRun: boolean;
  limit: number | null;
  restaurantId: string | null;
  concurrency?: number;
};

function newAssetUniqueId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) || 0 }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function processOneThumbnailBackfill(
  product: ThumbnailBackfillProduct,
  deps: ThumbnailBackfillDeps,
  options: { dryRun: boolean }
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "planned" }
  | { status: "processed"; thumbnailUrl: string; path: string }
  | { status: "failed"; reason: string }
> {
  if (!isThumbnailBackfillEligible(product)) {
    return { status: "skipped", reason: "not_eligible" };
  }

  if (options.dryRun) {
    return { status: "planned" };
  }

  const imageUrl = product.image_url!.trim();
  let uploadedPath: string | null = null;

  try {
    const source = await deps.downloadImage(imageUrl);
    const prepared = await prepareProductThumbnailBuffer(source);
    const unique = deps.newUniqueId();
    const paths = buildProductImageObjectPaths(
      product.restaurant_id,
      unique,
      "webp",
      prepared.ext
    );
    assertTenantProductThumbPath(product.restaurant_id, paths.thumbnail);
    uploadedPath = paths.thumbnail;

    const upload = await deps.uploadThumbnail({
      restaurantId: product.restaurant_id,
      path: paths.thumbnail,
      body: prepared.buffer,
      contentType: prepared.contentType,
    });
    if (!upload.ok) {
      return { status: "failed", reason: `upload: ${upload.error}` };
    }

    const thumbnailUrl = deps.publicUrlForPath(paths.thumbnail);
    const update = await deps.updateThumbnailUrl({
      productId: product.id,
      restaurantId: product.restaurant_id,
      thumbnailUrl,
      expectedImageUrl: imageUrl,
    });
    if (!update.ok) {
      await deps.removeStoragePath(paths.thumbnail);
      uploadedPath = null;
      if (/already set|skip/i.test(update.error)) {
        return { status: "skipped", reason: update.error };
      }
      return { status: "failed", reason: `db_update: ${update.error}` };
    }

    return { status: "processed", thumbnailUrl, path: paths.thumbnail };
  } catch (error) {
    if (uploadedPath) {
      try {
        await deps.removeStoragePath(uploadedPath);
      } catch {
        // best-effort only
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", reason: message };
  }
}

export async function runProductThumbnailBackfill(
  options: ThumbnailBackfillRunOptions,
  deps: ThumbnailBackfillDeps
): Promise<ThumbnailBackfillResult> {
  const log = deps.log ?? (() => {});
  const concurrency = options.concurrency ?? DEFAULT_BACKFILL_CONCURRENCY;

  const [candidates, restaurants] = await Promise.all([
    deps.listCandidateProducts({ restaurantId: options.restaurantId }),
    deps.listRestaurants(),
  ]);

  const restaurantName = new Map(
    restaurants.map((r) => [r.id, { name: r.name, slug: r.slug }] as const)
  );

  const eligibleAll = filterThumbnailBackfillEligible(candidates);
  const work = applyThumbnailBackfillLimit(eligibleAll, options.limit);

  const planned = work.map((p) => ({
    productId: p.id,
    restaurantId: p.restaurant_id,
    restaurantName: restaurantName.get(p.restaurant_id)?.name || "(unknown)",
    imageUrl: (p.image_url || "").trim(),
  }));

  const byRestaurantMap = new Map<string, ThumbnailBackfillRestaurantStats>();
  for (const p of eligibleAll) {
    const meta = restaurantName.get(p.restaurant_id);
    if (!byRestaurantMap.has(p.restaurant_id)) {
      byRestaurantMap.set(p.restaurant_id, {
        restaurantId: p.restaurant_id,
        name: meta?.name || "(unknown)",
        slug: meta?.slug ?? null,
        eligible: 0,
        processed: 0,
        skipped: 0,
        failed: 0,
      });
    }
    byRestaurantMap.get(p.restaurant_id)!.eligible += 1;
  }

  // Products filtered out by --limit count as skipped for reporting clarity
  const limitedOut = eligibleAll.length - work.length;

  if (options.dryRun) {
    log(
      `[dry-run] eligible=${eligibleAll.length} planned=${work.length} limit=${options.limit ?? "none"}`
    );
    return {
      dryRun: true,
      eligible: eligibleAll.length,
      processed: 0,
      skipped: limitedOut,
      failed: 0,
      failures: [],
      byRestaurant: [...byRestaurantMap.values()].sort((a, b) => b.eligible - a.eligible),
      planned,
    };
  }

  let processed = 0;
  let skipped = limitedOut;
  let failed = 0;
  const failures: ThumbnailBackfillFailure[] = [];

  await mapPool(work, concurrency, async (product) => {
    // Re-check eligibility (idempotency if row changed mid-run)
    if (!isThumbnailBackfillEligible(product)) {
      skipped += 1;
      const row = byRestaurantMap.get(product.restaurant_id);
      if (row) row.skipped += 1;
      return;
    }

    const result = await processOneThumbnailBackfill(product, deps, { dryRun: false });
    const row = byRestaurantMap.get(product.restaurant_id);
    if (result.status === "processed") {
      processed += 1;
      if (row) row.processed += 1;
      log(`[ok] ${product.id}`);
      return;
    }
    if (result.status === "skipped" || result.status === "planned") {
      skipped += 1;
      if (row) row.skipped += 1;
      return;
    }
    failed += 1;
    if (row) row.failed += 1;
    failures.push({
      productId: product.id,
      restaurantId: product.restaurant_id,
      reason: result.reason,
    });
    log(`[fail] ${product.id}: ${result.reason}`);
  });

  return {
    dryRun: false,
    eligible: eligibleAll.length,
    processed,
    skipped,
    failed,
    failures,
    byRestaurant: [...byRestaurantMap.values()].sort((a, b) => b.eligible - a.eligible),
    planned,
  };
}

export function createDefaultUniqueId(): string {
  return newAssetUniqueId();
}

/** Guard used by tests: uploaded thumb URL must resolve under the same restaurant products/. */
export function uploadedThumbBelongsToRestaurant(
  thumbnailUrl: string,
  restaurantId: string
): boolean {
  const path = publicProductStoragePathFromUrl(thumbnailUrl, restaurantId);
  if (!path) return false;
  try {
    assertTenantProductThumbPath(restaurantId, path);
    return true;
  } catch {
    return false;
  }
}

export function formatThumbnailBackfillReport(result: ThumbnailBackfillResult): string {
  const lines: string[] = [];
  lines.push(result.dryRun ? "=== Product thumbnail backfill (DRY RUN) ===" : "=== Product thumbnail backfill ===");
  lines.push(`Eligible: ${result.eligible}`);
  lines.push(`Processed: ${result.processed}`);
  lines.push(`Skipped: ${result.skipped}`);
  lines.push(`Failed: ${result.failed}`);
  lines.push("");
  lines.push("Restaurant breakdown (eligible):");
  for (const row of result.byRestaurant) {
    lines.push(
      `- ${row.name}${row.slug ? ` (${row.slug})` : ""}: eligible=${row.eligible}` +
        (result.dryRun
          ? ""
          : ` processed=${row.processed} skipped=${row.skipped} failed=${row.failed}`)
    );
  }
  if (result.dryRun && result.planned.length) {
    lines.push("");
    lines.push(`Planned products (${result.planned.length}):`);
    for (const item of result.planned) {
      lines.push(`- ${item.productId} | ${item.restaurantName} | ${item.imageUrl}`);
    }
  }
  if (result.failures.length) {
    lines.push("");
    lines.push("Failures:");
    for (const f of result.failures) {
      lines.push(`- ${f.productId}: ${f.reason}`);
    }
  }
  return lines.join("\n");
}

export { isNonEmptyUrl, isThumbnailBackfillEligible, filterThumbnailBackfillEligible } from "@/lib/product-thumbnail-backfill/eligibility";
