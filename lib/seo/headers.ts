/**
 * Faz 2.11a: arama motoru ile ilgili HTTP başlıkları.
 * - /api/ JSON uçları indekslenmez (robots.txt onları ENGELLEMEZ: menü sayfası içeriği oradan çeker).
 * - sitemap.xml önbellek politikası app/sitemap.xml/route.ts'te verilir (next.config başlığı olarak
 *   verilince Vercel'de uygulanmadı): 1 saat CDN, bayat sunum; hata yanıtları (5xx) saklanmaz.
 */

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

export function buildSeoHeaderRules(): HeaderRule[] {
  return [
    {
      source: "/api/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ];
}
