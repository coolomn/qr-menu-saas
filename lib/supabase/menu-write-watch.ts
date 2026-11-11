/**
 * Admin paneli menüyü tarayıcıdan doğrudan Supabase'e yazar (çok sayıda çağrı noktası).
 * Tek tek her kaydetme butonuna dokunmak yerine Supabase istemcisinin fetch'i sarılır:
 * menü tablolarına başarılı bir yazma olunca kısa bir gecikmeyle (birden çok kayıt tek istekte)
 * /api/menu/cache-refresh çağrılır ve QR menü önbelleği temizlenir.
 */

/** Herkese açık menüde görünen veriyi tutan tablolar. */
export const PUBLIC_MENU_TABLES: ReadonlySet<string> = new Set([
  "restaurants",
  "categories",
  "products",
  "product_variants",
  "menu_collections",
  "category_menu_collections",
  "product_menu_collections",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** PostgREST yazma isteği mi ve menü tablosuna mı? (/rest/v1/<tablo>) */
export function isPublicMenuWrite(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (READ_METHODS.has(requestMethod(input, init))) return false;
  let pathname: string;
  try {
    pathname = new URL(requestUrl(input), "http://localhost").pathname;
  } catch {
    return false;
  }
  const match = /^\/rest\/v1\/([a-z_]+)\/?$/.exec(pathname);
  return Boolean(match && PUBLIC_MENU_TABLES.has(match[1]));
}

/** Art arda gelen tetiklemeleri tek çağrıda birleştirir. */
export function createDebouncedTrigger(run: () => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    pending() {
      return timer !== null;
    },
  };
}

/** Başarılı (2xx) menü yazmalarından sonra onMenuWrite çağırır; isteğin sonucunu değiştirmez. */
export function withMenuWriteWatch(baseFetch: typeof fetch, onMenuWrite: () => void): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    try {
      if (response.ok && isPublicMenuWrite(input, init)) onMenuWrite();
    } catch {
      // Gözlem hatası kaydı asla bozmamalı.
    }
    return response;
  };
}
