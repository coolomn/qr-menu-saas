import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { MARKETING_SITE_ORIGIN, MENU_SITE_ORIGIN, seoSurfaceForHost } from "@/lib/seo/host-surface";

/**
 * Faz 2.11a: robots.txt alan adına göre değişir (aynı dosya üç alan adında çalışır).
 * - qr.…  : her şey taranabilir. /api/ BİLEREK engellenmez: menü sayfası içeriği tarayıcıda
 *           /api/menu…'dan çeker, Google sayfayı çizerken oraya erişebilmeli.
 * - ana   : pazarlama sitesi; panel ve API kapalı.
 * - app./önizleme/yerel: tamamen kapalı.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const surface = seoSurfaceForHost(h.get("x-forwarded-host") ?? h.get("host"));

  if (surface === "menu") {
    return {
      rules: { userAgent: "*", allow: "/" },
      sitemap: `${MENU_SITE_ORIGIN}/sitemap.xml`,
    };
  }
  if (surface === "marketing") {
    return {
      rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
      sitemap: `${MARKETING_SITE_ORIGIN}/sitemap.xml`,
    };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
