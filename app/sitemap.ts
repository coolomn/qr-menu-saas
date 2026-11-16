import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { MARKETING_SITE_ORIGIN, seoSurfaceForHost } from "@/lib/seo/host-surface";
import { loadMenuSitemapEntries } from "@/lib/seo/sitemap-data";

/**
 * Faz 2.11a: sitemap.xml alan adına göre.
 * - qr.…  : "Google'da görünsün" açık, abonelik süren restoranların menüleri + aktif ürün sayfaları
 * - ana   : yalnız ana sayfa (pazarlama sitesi Faz 5'te genişler)
 * - diğer : boş
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const surface = seoSurfaceForHost(h.get("x-forwarded-host") ?? h.get("host"));

  if (surface === "menu") return loadMenuSitemapEntries();
  if (surface === "marketing") return [{ url: `${MARKETING_SITE_ORIGIN}/` }];
  return [];
}
