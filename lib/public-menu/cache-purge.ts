import { dangerouslyDeleteByTag } from "@vercel/functions";

/**
 * Herkese açık menü API yanıtları Vercel CDN'de restoran bazlı etiketle saklanır
 * (Vercel-Cache-Tag). Menü değiştiğinde bu etiket silinir; bir sonraki ziyaretçi
 * güncel menüyü alır. Vercel dışında (yerel/test) purge API yoktur, çağrı sessizce no-op olur.
 */
export function publicMenuCacheTag(restaurantId: string): string {
  return `menu-${restaurantId}`;
}

export type PurgeTagsFn = (tags: string[]) => Promise<void>;

const defaultPurge: PurgeTagsFn = (tags) => dangerouslyDeleteByTag(tags);

/**
 * Hata fırlatmaz: önbellek temizlenemezse kayıt yine başarılıdır; menü en geç
 * s-maxage süresi dolunca kendiliğinden güncellenir.
 */
export async function purgePublicMenuCache(
  restaurantIds: string | ReadonlyArray<string | null | undefined>,
  purge: PurgeTagsFn = defaultPurge
): Promise<boolean> {
  const list = typeof restaurantIds === "string" ? [restaurantIds] : restaurantIds;
  const ids = [...new Set(list.map((id) => (id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return true;
  try {
    await purge(ids.map(publicMenuCacheTag));
    return true;
  } catch (error) {
    console.error("[menu-cache] önbellek temizlenemedi:", error);
    return false;
  }
}
