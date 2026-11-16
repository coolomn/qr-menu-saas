/**
 * Faz 2.11a: arama motoru ile ilgili HTTP başlıkları (next.config.ts → headers()).
 * - qr alan adının sitemap.xml'i 1 saat CDN'de tutulur: her istekte tüm tablolar taranmasın.
 *   Hata yanıtları (5xx) CDN'de saklanmaz, böylece geçici bir hata kalıcılaşmaz.
 * - /api/ JSON uçları indekslenmez (robots.txt onları ENGELLEMEZ: menü sayfası içeriği oradan çeker).
 */
// next.config.ts bu dosyayı yükler: "@/" kısayolu orada çözülmeyebilir → göreli import.
import { PRODUCTION_HOST_SET } from "../domains/hosts";

type Header = { key: string; value: string };
type HeaderRule = {
  source: string;
  has?: { type: "host"; value: string }[];
  headers: Header[];
};

export const SITEMAP_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

export function buildSeoHeaderRules(): HeaderRule[] {
  const host = PRODUCTION_HOST_SET.menu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    {
      source: "/sitemap.xml",
      has: [{ type: "host", value: host }],
      headers: [{ key: "Cache-Control", value: SITEMAP_CACHE_CONTROL }],
    },
    {
      source: "/api/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ];
}
