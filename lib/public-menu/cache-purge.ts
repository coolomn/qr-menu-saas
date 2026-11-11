import { addCacheTag, dangerouslyDeleteByTag } from "@vercel/functions";

/**
 * Herkese açık menü API yanıtları Vercel CDN'de restoran bazlı etiketle saklanır
 * (addCacheTag + Vercel-Cache-Tag başlığı). Menü değiştiğinde bu etiket silinir; bir sonraki
 * ziyaretçi güncel menüyü alır. Vercel dışında (yerel/test) purge API yoktur, çağrı no-op olur.
 */
export function publicMenuCacheTag(restaurantId: string): string {
  return `menu-${restaurantId}`;
}

export type PurgeTagsFn = (tags: string[]) => Promise<void>;
export type PurgeResult = "purged" | "unavailable" | "failed" | "skipped";

const VERCEL_REQUEST_CONTEXT = Symbol.for("@vercel/request-context");

/** Vercel çalışma ortamı istek bağlamında purge API'si var mı? (yerelde yok) */
export function isVercelPurgeAvailable(): boolean {
  const ctx = (globalThis as Record<symbol, { get?: () => { purge?: unknown } } | undefined>)[
    VERCEL_REQUEST_CONTEXT
  ]?.get?.();
  return Boolean(ctx?.purge);
}

const defaultPurge: PurgeTagsFn = (tags) => dangerouslyDeleteByTag(tags);

/**
 * Hata fırlatmaz: önbellek temizlenemezse kayıt yine başarılıdır; menü en geç
 * s-maxage süresi dolunca kendiliğinden güncellenir.
 */
export async function purgePublicMenuCache(
  restaurantIds: string | ReadonlyArray<string | null | undefined>,
  purge: PurgeTagsFn = defaultPurge,
  isAvailable: () => boolean = isVercelPurgeAvailable
): Promise<PurgeResult> {
  const list = typeof restaurantIds === "string" ? [restaurantIds] : restaurantIds;
  const ids = [...new Set(list.map((id) => (id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return "skipped";
  if (!isAvailable()) return "unavailable";
  try {
    await purge(ids.map(publicMenuCacheTag));
    return "purged";
  } catch (error) {
    console.error("[menu-cache] önbellek temizlenemedi:", error);
    return "failed";
  }
}

/** Herkese açık menü yanıtını restoran etiketine bağlar (Vercel dışında no-op). */
export async function tagPublicMenuResponse(restaurantId: string): Promise<void> {
  try {
    await addCacheTag(publicMenuCacheTag(restaurantId));
  } catch (error) {
    console.error("[menu-cache] etiket eklenemedi:", error);
  }
}
