import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canonicalProductUrl } from "@/lib/domains/hosts";
import { loadPublicProduct } from "@/lib/public-menu/load-public-product";
import { resolvePublicProductCardImageSrc } from "@/lib/public-menu/product-image-urls";
import { buildMenuItemJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { isSeoVisible, loadMenuSeo, shouldNoIndex } from "@/lib/seo/menu-seo";
import { ProductPageClient } from "./product-page-client";

type PageProps = { params: Promise<{ slug: string; productId: string }> };

// Fiyat/tükendi bilgisi ve abonelik kapanışı anında yansısın: sayfa her istekte okunur.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, productId } = await params;
  const [result, seoResult] = await Promise.all([loadPublicProduct(slug, productId), loadMenuSeo(slug)]);
  if (!result.ok) return { title: "Menü - TapMenu", robots: { index: false } };

  const { restaurant, product } = result.data;
  const title = `${product.name} - ${restaurant.name}`;
  const description = product.description?.trim() || `${restaurant.name} dijital menüsü`;
  const image = resolvePublicProductCardImageSrc(product);
  // Sahip "Google'da görünsün"ü kapattıysa ürün sayfası da indekslenmez.
  return {
    title,
    description,
    alternates: { canonical: canonicalProductUrl(slug, productId) },
    openGraph: { title, description, ...(image ? { images: [image] } : {}) },
    ...(shouldNoIndex(seoResult) ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug, productId } = await params;
  const result = await loadPublicProduct(slug, productId);
  if (!result.ok) {
    if (result.reason === "error") throw new Error("Ürün sayfası okunamadı.");
    notFound();
  }
  const { product } = result.data;
  const seoResult = await loadMenuSeo(slug);
  const jsonLd = seoResult.status === "found" && isSeoVisible(seoResult.info)
    ? serializeJsonLd(
        buildMenuItemJsonLd({
          name: product.name,
          description: product.description,
          url: canonicalProductUrl(slug, productId),
          imageUrl: resolvePublicProductCardImageSrc(product),
          price: product.price,
          variantPrices: product.variants?.map((v) => v.price),
          badges: product.badges,
          calories: product.calories,
          proteinG: product.protein_g,
          carbsG: product.carbs_g,
          fatG: product.fat_g,
          soldOut: product.is_sold_out,
        })
      )
    : null;
  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
      <ProductPageClient slug={slug} data={result.data} />
    </>
  );
}
