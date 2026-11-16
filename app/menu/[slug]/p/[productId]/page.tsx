import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canonicalProductUrl } from "@/lib/domains/hosts";
import { loadPublicProduct } from "@/lib/public-menu/load-public-product";
import { resolvePublicProductCardImageSrc } from "@/lib/public-menu/product-image-urls";
import { ProductPageClient } from "./product-page-client";

type PageProps = { params: Promise<{ slug: string; productId: string }> };

// Fiyat/tükendi bilgisi ve abonelik kapanışı anında yansısın: sayfa her istekte okunur.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, productId } = await params;
  const result = await loadPublicProduct(slug, productId);
  if (!result.ok) return { title: "Menü - TapMenu", robots: { index: false } };

  const { restaurant, product } = result.data;
  const title = `${product.name} - ${restaurant.name}`;
  const description = product.description?.trim() || `${restaurant.name} dijital menüsü`;
  const image = resolvePublicProductCardImageSrc(product);
  return {
    title,
    description,
    alternates: { canonical: canonicalProductUrl(slug, productId) },
    openGraph: { title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug, productId } = await params;
  const result = await loadPublicProduct(slug, productId);
  if (!result.ok) {
    if (result.reason === "error") throw new Error("Ürün sayfası okunamadı.");
    notFound();
  }
  return <ProductPageClient slug={slug} data={result.data} />;
}
