import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ThumbnailBackfillProduct } from "@/lib/product-thumbnail-backfill/eligibility";
import {
  createDefaultUniqueId,
  MENU_PUBLIC_BUCKET,
  PRODUCT_IMAGE_CACHE_CONTROL,
  type RestaurantLabel,
  type ThumbnailBackfillDeps,
} from "@/lib/product-thumbnail-backfill/run";
import { isNonEmptyUrl } from "@/lib/product-thumbnail-backfill/eligibility";

export function loadEnvFile(filePath: string): Record<string, string> {
  const absolute = resolve(filePath);
  const out: Record<string, string> = {};
  for (const line of readFileSync(absolute, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function createServiceSupabaseFromEnv(env: Record<string, string>): SupabaseClient {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in env file.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in env file.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function listAllProducts(
  client: SupabaseClient,
  restaurantId: string | null
): Promise<ThumbnailBackfillProduct[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: ThumbnailBackfillProduct[] = [];

  while (true) {
    let query = client
      .from("products")
      .select("id, restaurant_id, image_url, thumbnail_url")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (restaurantId) {
      query = query.eq("restaurant_id", restaurantId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`products list failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      rows.push({
        id: row.id,
        restaurant_id: row.restaurant_id,
        image_url: row.image_url,
        thumbnail_url: row.thumbnail_url,
      });
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export function createSupabaseThumbnailBackfillDeps(
  client: SupabaseClient,
  options?: { log?: (message: string) => void }
): ThumbnailBackfillDeps {
  return {
    log: options?.log,
    newUniqueId: createDefaultUniqueId,
    listCandidateProducts: async ({ restaurantId }) => listAllProducts(client, restaurantId),
    listRestaurants: async () => {
      const { data, error } = await client.from("restaurants").select("id, name, slug");
      if (error) throw new Error(`restaurants list failed: ${error.message}`);
      return (data || []).map(
        (r): RestaurantLabel => ({
          id: r.id,
          name: r.name,
          slug: r.slug ?? null,
        })
      );
    },
    downloadImage: async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`download HTTP ${response.status}`);
      }
      const contentType = response.headers.get("content-type") || "";
      if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
        throw new Error(`unexpected content-type: ${contentType}`);
      }
      const ab = await response.arrayBuffer();
      if (!ab.byteLength) throw new Error("empty image body");
      return Buffer.from(ab);
    },
    uploadThumbnail: async ({ path, body, contentType }) => {
      const { error } = await client.storage.from(MENU_PUBLIC_BUCKET).upload(path, body, {
        contentType,
        cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
        upsert: false,
      });
      if (error) return { ok: false, error: error.message || "upload failed" };
      return { ok: true };
    },
    updateThumbnailUrl: async ({ productId, restaurantId, thumbnailUrl, expectedImageUrl }) => {
      const { data: current, error: readError } = await client
        .from("products")
        .select("id, image_url, thumbnail_url, restaurant_id")
        .eq("id", productId)
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (readError) return { ok: false, error: readError.message || "read failed" };
      if (!current) return { ok: false, error: "product not found for tenant" };
      if ((current.image_url || "").trim() !== expectedImageUrl.trim()) {
        return { ok: false, error: "image_url changed since planning; refusing update" };
      }
      if (isNonEmptyUrl(current.thumbnail_url)) {
        return { ok: false, error: "thumbnail_url already set; skip" };
      }

      const { data, error } = await client
        .from("products")
        .update({ thumbnail_url: thumbnailUrl })
        .eq("id", productId)
        .eq("restaurant_id", restaurantId)
        .select("id, image_url, thumbnail_url");
      if (error) return { ok: false, error: error.message || "update failed" };
      if (!data?.length) return { ok: false, error: "row not updated" };
      if ((data[0].image_url || "").trim() !== expectedImageUrl.trim()) {
        return { ok: false, error: "image_url unexpectedly changed" };
      }
      return { ok: true };
    },
    removeStoragePath: async (path) => {
      const { error } = await client.storage.from(MENU_PUBLIC_BUCKET).remove([path]);
      if (error) {
        console.warn("[backfill-thumbnails] orphan cleanup skipped:", path, error.message);
      }
    },
    publicUrlForPath: (path) =>
      client.storage.from(MENU_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl,
  };
}

/** Re-read eligibility from live row (optional mid-run check helper). */
export function productStillNeedsThumbnail(row: {
  image_url?: string | null;
  thumbnail_url?: string | null;
}): boolean {
  return isNonEmptyUrl(row.image_url) && !isNonEmptyUrl(row.thumbnail_url);
}
