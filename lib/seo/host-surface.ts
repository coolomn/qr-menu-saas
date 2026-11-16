import { PRODUCTION_HOST_SET, normalizeHostname } from "@/lib/domains/hosts";

/**
 * robots.txt / sitemap.xml aynı dosyadan üç alan adına hizmet eder; hangisi olduğunu host belirler.
 * - menu:      qr.tapmenu.com.tr  → menü + ürün sayfaları taranır, site haritası var
 * - marketing: tapmenu.com.tr     → pazarlama sitesi (Faz 5'te genişler)
 * - app:       app.tapmenu.com.tr → panel, hiç taranmaz
 * - private:   test/önizleme/yerel adresler → hiç taranmaz (önizlemeler Google'a girmesin)
 */
export type SeoSurface = "menu" | "marketing" | "app" | "private";

export function seoSurfaceForHost(host: string | null | undefined): SeoSurface {
  const hostname = normalizeHostname(host);
  if (hostname === PRODUCTION_HOST_SET.menu) return "menu";
  if (hostname === PRODUCTION_HOST_SET.app) return "app";
  if (PRODUCTION_HOST_SET.marketing.includes(hostname)) return "marketing";
  return "private";
}

export const MENU_SITE_ORIGIN = `https://${PRODUCTION_HOST_SET.menu}`;
export const MARKETING_SITE_ORIGIN = `https://${PRODUCTION_HOST_SET.marketing[0]}`;
