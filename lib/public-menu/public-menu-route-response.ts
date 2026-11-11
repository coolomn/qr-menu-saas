import { NextResponse } from "next/server";
import {
  publicMenuCacheHeadersForStatus,
  VERCEL_CACHE_TAG_HEADER,
} from "@/lib/public-menu/cache-headers";
import { publicMenuCacheTag } from "@/lib/public-menu/cache-purge";

/**
 * restaurantId verilirse başarılı (200) yanıt CDN'de restoran etiketiyle saklanır;
 * menü kaydedildiğinde purgePublicMenuCache ile anında temizlenebilir.
 */
export function publicMenuJsonResponse<T>(
  body: T,
  status = 200,
  options?: { restaurantId?: string }
) {
  const headers: Record<string, string> = { ...publicMenuCacheHeadersForStatus(status) };
  if (status === 200 && options?.restaurantId) {
    headers[VERCEL_CACHE_TAG_HEADER] = publicMenuCacheTag(options.restaurantId);
  }
  return NextResponse.json(body, { status, headers });
}
