/** CDN edge TTL for successful public menu API responses. */
export const PUBLIC_MENU_CDN_S_MAXAGE_SECONDS = 60;

/** CDN may serve stale while revalidating after s-maxage expires. */
export const PUBLIC_MENU_CDN_STALE_WHILE_REVALIDATE_SECONDS = 300;

export const PUBLIC_MENU_SUCCESS_CACHE_CONTROL =
  `public, max-age=0, s-maxage=${PUBLIC_MENU_CDN_S_MAXAGE_SECONDS}, stale-while-revalidate=${PUBLIC_MENU_CDN_STALE_WHILE_REVALIDATE_SECONDS}` as const;

export const PUBLIC_MENU_SUCCESS_CACHE_HEADERS = {
  "Cache-Control": PUBLIC_MENU_SUCCESS_CACHE_CONTROL,
} as const;

export const PUBLIC_MENU_ERROR_CACHE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

export function publicMenuCacheHeadersForStatus(status: number) {
  return status === 200 ? PUBLIC_MENU_SUCCESS_CACHE_HEADERS : PUBLIC_MENU_ERROR_CACHE_HEADERS;
}

/** Slug-scoped full menu API path (distinct cache key per restaurant). */
export function publicMenuApiPath(slug: string): string {
  return `/api/public-menu/${encodeURIComponent(slug.trim())}`;
}

/** Slug-scoped bootstrap API path (distinct cache key per restaurant). */
export function publicMenuBootstrapApiPath(slug: string): string {
  return `${publicMenuApiPath(slug)}/bootstrap`;
}
