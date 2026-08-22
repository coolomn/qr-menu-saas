/**
 * CLI: legacy product thumbnail backfill.
 *
 * Examples:
 *   pnpm backfill:product-thumbnails --dry-run
 *   pnpm backfill:product-thumbnails --dry-run --limit=5
 *   pnpm backfill:product-thumbnails --dry-run --restaurant-id=<uuid>
 *   pnpm backfill:product-thumbnails --limit=3 --restaurant-id=<uuid>
 *
 * Never prints env secret values.
 */

import { parseThumbnailBackfillArgs } from "@/lib/product-thumbnail-backfill/eligibility";
import {
  formatThumbnailBackfillReport,
  runProductThumbnailBackfill,
} from "@/lib/product-thumbnail-backfill/run";
import {
  createServiceSupabaseFromEnv,
  createSupabaseThumbnailBackfillDeps,
  loadEnvFile,
} from "@/lib/product-thumbnail-backfill/supabase-deps";

const HELP = `Usage:
  pnpm backfill:product-thumbnails --dry-run [--limit=N] [--restaurant-id=UUID] [--concurrency=2] [--env-file=.env.production.local]

Flags:
  --dry-run           Read-only report (no Storage upload, no DB update)
  --limit=N           Process at most N eligible products
  --restaurant-id=ID  Restrict to one tenant
  --concurrency=N     Parallel workers (1–5, default 2)
  --env-file=PATH     Default: .env.production.local

Write mode (omit --dry-run) updates thumbnail_url only; never mutates image_url.
`;

async function main() {
  let options;
  try {
    options = parseThumbnailBackfillArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof Error && error.message === "HELP") {
      console.log(HELP);
      process.exit(0);
    }
    console.error(error instanceof Error ? error.message : String(error));
    console.error(HELP);
    process.exit(1);
  }

  const env = loadEnvFile(options.envFile);
  const host = (() => {
    try {
      return new URL(env.NEXT_PUBLIC_SUPABASE_URL || "").host;
    } catch {
      return "(invalid url)";
    }
  })();

  console.log(`Env file: ${options.envFile}`);
  console.log(`Supabase host: ${host}`);
  console.log(
    `Mode: ${options.dryRun ? "DRY RUN" : "WRITE"} | limit=${options.limit ?? "none"} | restaurant=${options.restaurantId ?? "all"} | concurrency=${options.concurrency}`
  );

  if (!options.dryRun) {
    console.log("WARNING: write mode — will upload thumbnails and update thumbnail_url only.");
  }

  const client = createServiceSupabaseFromEnv(env);
  const deps = createSupabaseThumbnailBackfillDeps(client, {
    log: (message) => console.log(message),
  });

  const result = await runProductThumbnailBackfill(
    {
      dryRun: options.dryRun,
      limit: options.limit,
      restaurantId: options.restaurantId,
      concurrency: options.concurrency,
    },
    deps
  );

  console.log(formatThumbnailBackfillReport(result));
  process.exit(result.failed > 0 ? 2 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
