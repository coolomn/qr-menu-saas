import type { Metadata } from "next";
import { canonicalMenuUrl } from "@/lib/domains/hosts";
import { buildRestaurantJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { isSeoVisible, loadMenuSeo, shouldNoIndex } from "@/lib/seo/menu-seo";

type LayoutProps = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadMenuSeo(slug);
  const name = result.status === "found" ? result.info.name : "";
  const title = name ? `${name} - Dijital menü` : "Menü - TapMenu";
  return {
    title,
    // Menü hem eski (tapmenu.com.tr/menu/…) hem yeni (qr.tapmenu.com.tr/…) adreste açılır;
    // arama motorlarına asıl adresin qr alan adı olduğunu bildiririz.
    ...(name ? { alternates: { canonical: canonicalMenuUrl(slug) } } : {}),
    // Sahip "Google'da görünsün"ü kapattıysa, abonelik bittiyse ya da restoran yoksa indekslenmez.
    // Okuma hatasında etiket eklenmez: geçici hata canlı menüyü indeksten düşürmesin.
    ...(shouldNoIndex(result) ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function MenuSlugLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const result = await loadMenuSeo(slug);
  const seo = result.status === "found" ? result.info : null;
  const jsonLd =
    seo && isSeoVisible(seo)
      ? serializeJsonLd(
          buildRestaurantJsonLd({
            name: seo.name,
            url: canonicalMenuUrl(slug),
            logoUrl: seo.logoUrl,
            instagram: seo.instagram,
            socialLinks: seo.socialLinks,
            openingHours: seo.openingHours,
          })
        )
      : null;

  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
      {children}
    </>
  );
}
