export type ThumbnailBackfillProduct = {
  id: string;
  restaurant_id: string;
  image_url: string | null;
  thumbnail_url: string | null;
};

export function isNonEmptyUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Eligible: image present, thumbnail missing/blank. */
export function isThumbnailBackfillEligible(product: ThumbnailBackfillProduct): boolean {
  return isNonEmptyUrl(product.image_url) && !isNonEmptyUrl(product.thumbnail_url);
}

export function filterThumbnailBackfillEligible(
  products: ThumbnailBackfillProduct[]
): ThumbnailBackfillProduct[] {
  return products.filter(isThumbnailBackfillEligible);
}

export type ThumbnailBackfillCliOptions = {
  dryRun: boolean;
  limit: number | null;
  restaurantId: string | null;
  concurrency: number;
  envFile: string;
};

export function parseThumbnailBackfillArgs(argv: string[]): ThumbnailBackfillCliOptions {
  let dryRun = false;
  let limit: number | null = null;
  let restaurantId: string | null = null;
  let concurrency = 2;
  let envFile = ".env.production.local";

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      limit = n;
      continue;
    }
    if (arg.startsWith("--restaurant-id=")) {
      const id = arg.slice("--restaurant-id=".length).trim();
      restaurantId = id || null;
      continue;
    }
    if (arg.startsWith("--concurrency=")) {
      const n = Number.parseInt(arg.slice("--concurrency=".length), 10);
      if (!Number.isFinite(n) || n < 1 || n > 5) {
        throw new Error(`Invalid --concurrency (1–5): ${arg}`);
      }
      concurrency = n;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      envFile = arg.slice("--env-file=".length).trim() || envFile;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error("HELP");
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, limit, restaurantId, concurrency, envFile };
}

export function applyThumbnailBackfillLimit<T>(items: T[], limit: number | null): T[] {
  if (limit == null) return items;
  return items.slice(0, limit);
}

export function assertTenantProductThumbPath(restaurantId: string, storagePath: string): void {
  const prefix = `restaurants/${restaurantId}/products/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..") || storagePath.includes("//")) {
    throw new Error(`Refusing non-tenant product path: ${storagePath}`);
  }
  if (!storagePath.includes("-thumb.")) {
    throw new Error(`Refusing non-thumbnail product path: ${storagePath}`);
  }
}
