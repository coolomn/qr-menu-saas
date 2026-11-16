import { headers } from "next/headers";
import { MARKETING_SITE_ORIGIN, seoSurfaceForHost } from "@/lib/seo/host-surface";
import { SITEMAP_CACHE_CONTROL } from "@/lib/seo/headers";
import { loadMenuSitemapEntries } from "@/lib/seo/sitemap-data";
import { renderSitemapXml } from "@/lib/seo/sitemap-xml";

/**
 * Faz 2.11a: sitemap.xml alan adına göre.
 * - qr.…  : "Google'da görünsün" açık, abonelik süren restoranların menüleri + aktif ürün sayfaları
 * - ana   : yalnız ana sayfa (pazarlama sitesi Faz 5'te genişler)
 * - diğer : boş
 *
 * Route handler (app/sitemap.ts değil): Vercel'de metadata dosyasının Cache-Control'ü
 * next.config başlığıyla değiştirilemedi (CDN'e hiç takılmadı); burada açıkça verilir.
 * Okuma hatasında 500 + no-store: eksik/sızıntılı site haritası yayınlanmaz, Google tekrar dener.
 */
export const dynamic = "force-dynamic";

const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8" } as const;

export async function GET(): Promise<Response> {
  const h = await headers();
  const surface = seoSurfaceForHost(h.get("x-forwarded-host") ?? h.get("host"));

  if (surface === "menu") {
    try {
      const entries = await loadMenuSitemapEntries();
      return new Response(renderSitemapXml(entries.map((e) => e.url)), {
        headers: { ...XML_HEADERS, "Cache-Control": SITEMAP_CACHE_CONTROL },
      });
    } catch (error) {
      console.error("sitemap:", error instanceof Error ? error.message : error);
      return new Response("Sitemap geçici olarak üretilemedi.", {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, max-age=0" },
      });
    }
  }

  const urls = surface === "marketing" ? [`${MARKETING_SITE_ORIGIN}/`] : [];
  return new Response(renderSitemapXml(urls), {
    headers: { ...XML_HEADERS, "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
