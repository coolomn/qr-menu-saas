import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { isPublicMenuBlocked } from "@/lib/public-menu/subscription-gate";
import { canonicalMenuUrl, canonicalProductUrl } from "@/lib/domains/hosts";
import { isMissingColumnError, type DbError } from "./db-errors";

/** sitemap.xml üst sınırı 50.000 URL; güvenli pay bırakılır (aşılırsa sitemap parçalama gerekir). */
export const SITEMAP_MAX_URLS = 45000;
const PAGE = 1000;
/** .in() süzgecindeki restoran sayısı (URL uzunluğunu makul tutar). */
const RESTAURANT_CHUNK = 20;

export type SitemapEntry = { url: string };

type RestaurantRow = {
  id: string;
  slug: string;
  seo_indexable?: boolean | null;
  tenant_status?: string | null;
  subscription_ends_at?: string | null;
};

export function isSitemapRestaurant(row: Pick<RestaurantRow, "slug" | "seo_indexable" | "tenant_status" | "subscription_ends_at">): boolean {
  if (!row.slug?.trim()) return false;
  if (row.seo_indexable === false) return false;
  return !isPublicMenuBlocked({
    tenant_status: row.tenant_status ?? null,
    subscription_ends_at: row.subscription_ends_at ?? null,
  });
}

export class SitemapDataError extends Error {}

/**
 * Sayfalı okuma: boş sayfaya kadar devam eder (Supabase max_rows sayfa boyutundan küçük olsa da eksik kalmaz).
 * Hata olursa fırlatır; çağıran eksik/boş bir site haritasını 200 ile yayınlamasın diye.
 */
async function fetchAll<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: DbError | null }>,
  limit = Number.POSITIVE_INFINITY
): Promise<T[]> {
  const out: T[] = [];
  // Sonraki sayfa, ALINAN satır kadar ilerler: sunucunun max_rows sınırı PAGE'den küçükse satır atlanmaz.
  for (let from = 0; out.length < limit; from = out.length) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw Object.assign(new SitemapDataError(`${label}: ${error.message ?? "okunamadı"}`), { dbError: error });
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    out.push(...rows);
  }
  return out;
}

async function loadRestaurants(client: SupabaseClient): Promise<RestaurantRow[]> {
  const read = (columns: string) =>
    fetchAll<RestaurantRow>("restaurants", (from, to) =>
      client.from("restaurants").select(columns).order("slug").range(from, to)
    );
  try {
    return await read("id,slug,seo_indexable,tenant_status,subscription_ends_at");
  } catch (error) {
    // Yalnız "kolon yok" (migration uygulanmadı) → kolonsuz sorgu. Başka hata: yukarı fırlat
    // (aksi halde "Google'a kapalı" restoranlar yanlışlıkla site haritasına girerdi).
    const dbError = (error as { dbError?: DbError }).dbError;
    if (dbError && isMissingColumnError(dbError)) {
      return read("id,slug,tenant_status,subscription_ends_at");
    }
    throw error;
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Menü alan adının site haritası: indekslenebilir restoranların menü adresi + aktif ürün adresleri.
 * Ürün sayfası yalnız aktif kategorideki aktif ürünü gösterir → site haritası da aynı kuralı izler.
 * Okuma hatasında SitemapDataError fırlatır (sitemap 500 döner; Google tekrar dener, kalıcı kayıp olmaz).
 */
export async function loadMenuSitemapEntries(clientOverride?: SupabaseClient): Promise<SitemapEntry[]> {
  let client = clientOverride;
  if (!client) {
    const service = tryCreateServiceSupabase();
    if (!service.ok) throw new SitemapDataError(service.error);
    client = service.client;
  }

  const eligible = (await loadRestaurants(client)).filter(isSitemapRestaurant);
  const entries: SitemapEntry[] = eligible.map((r) => ({ url: canonicalMenuUrl(r.slug) }));

  for (const group of chunk(eligible, RESTAURANT_CHUNK)) {
    if (entries.length >= SITEMAP_MAX_URLS) break;
    const ids = group.map((r) => r.id);
    const slugByRestaurant = new Map(group.map((r) => [r.id, r.slug]));

    const categories = await fetchAll<{ id: string; restaurant_id: string }>("categories", (from, to) =>
      client
        .from("categories")
        .select("id,restaurant_id")
        .in("restaurant_id", ids)
        .neq("is_active", false)
        .order("id")
        .range(from, to)
    );
    const slugByCategory = new Map<string, string>();
    for (const c of categories) {
      const slug = slugByRestaurant.get(c.restaurant_id);
      if (slug) slugByCategory.set(c.id, slug);
    }

    const products = await fetchAll<{ id: string; category_id: string }>(
      "products",
      (from, to) =>
        client
          .from("products")
          .select("id,category_id")
          .in("restaurant_id", ids)
          .eq("is_active", true)
          .order("id")
          .range(from, to),
      SITEMAP_MAX_URLS
    );
    for (const p of products) {
      if (entries.length >= SITEMAP_MAX_URLS) break;
      const slug = slugByCategory.get(p.category_id);
      if (slug) entries.push({ url: canonicalProductUrl(slug, p.id) });
    }
  }
  return entries;
}
