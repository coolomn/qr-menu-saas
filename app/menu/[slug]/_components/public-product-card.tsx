"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { usePublicProductUrl } from "@/lib/domains/use-public-menu-url";
import {
  hasProductVariants,
  type PublicProduct,
  type PublicProductVariant,
} from "@/lib/public-menu/product-variants";
import { PublicMenuPrice } from "@/app/menu/[slug]/_components/public-menu-price";
import { parsePriceForDisplay } from "@/lib/format-price";
import {
  resolveMenuPresentation,
  type ResolvedMenuPresentation,
} from "@/lib/public-menu/themes/resolve";
import { ProductImageLightbox } from "@/app/menu/[slug]/_components/ProductImageLightbox";
import { PublicProductAllergens } from "@/app/menu/[slug]/_components/public-product-allergens";
import { resolvePublicProductCardImageSrc } from "@/lib/public-menu/product-image-urls";
import { pickLang, resolveProductBadges } from "@/lib/public-menu/venue-info";
import { variantPriceRangeRaw } from "@/lib/public-menu/menu-filters";

type PublicProductCardProps = {
  product: PublicProduct;
  theme: ResolvedMenuPresentation;
  getText: (item: Record<string, unknown>, field: string) => string;
  /** Faz 2.3: şu an servis dışı (soluk gösterilir, ürün yine de okunur). */
  outOfService?: boolean;
  /** Ürünün kendi zamanlamasından gelen not ("Şu an servis dışı · 11:00'de başlar"). */
  serviceNote?: string | null;
};

function getVariantLabel(
  variant: PublicProductVariant,
  language: string
): string {
  const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (language === "en") {
    const en = pick(variant.label_en);
    if (en) return en;
  }
  if (language === "ru") {
    const ru = pick(variant.label_ru);
    if (ru) return ru;
  }
  return pick(variant.label) || variant.label;
}

export function PublicProductCard({
  product,
  theme,
  getText,
  language = "tr",
  outOfService = false,
  serviceNote = null,
}: PublicProductCardProps & { language?: string }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const params = useParams();
  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const productUrlOf = usePublicProductUrl();
  const productUrl = productUrlOf(slug ?? "", product.id);
  const productUrlFor = useCallback((id: string) => productUrlOf(slug ?? "", id), [productUrlOf, slug]);
  // Pencereyi biz açtıysak adres çubuğuna ürün linki yazılır; geri tuşu pencereyi kapatır.
  const pushedRef = useRef(false);

  const openDetail = useCallback(() => {
    if (slug) {
      try {
        window.history.pushState(null, "", productUrl);
        pushedRef.current = true;
      } catch {
        pushedRef.current = false;
      }
    }
    setDetailOpen(true);
  }, [slug, productUrl]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const onPopState = () => {
      pushedRef.current = false;
      setDetailOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [detailOpen]);
  const resolvedTheme = theme ?? resolveMenuPresentation("classic", "classic");
  const c = resolvedTheme.classes;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const showVariants = hasProductVariants(variants);
  const productRecord = product as unknown as Record<string, unknown>;
  const productName = getText(productRecord, "name");
  const description = getText(productRecord, "description");
  const cardImageUrl = resolvePublicProductCardImageSrc(product);
  const soldOut = product.is_sold_out === true;
  const faded = soldOut || outOfService;
  const badges = resolveProductBadges(product.badges, language);
  const priceRange = showVariants ? variantPriceRangeRaw(product) : null;

  return (
    <>
      <a
        href={productUrl}
        className={`${c.productCard} w-full cursor-pointer text-left transition-opacity hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`}
        onClick={(event) => {
          // Ctrl/Cmd/orta tık: tarayıcı linki kendi açsın; normal tık: sayfa içinde pencere.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault();
          openDetail();
        }}
        aria-label={productName ? `${productName} — detayları gör` : "Ürün detaylarını gör"}
      >
        {cardImageUrl && (
          <div className={`${c.productImageWrap} pointer-events-none`}>
            <img
              src={cardImageUrl}
              alt=""
              className={`w-full h-full object-cover ${soldOut ? "grayscale opacity-50" : outOfService ? "opacity-70" : ""}`}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        )}
        <div className="flex-1 flex flex-col min-w-0 justify-center pointer-events-none">
          <div
            className={`flex justify-between items-start gap-2 ${
              showVariants ? "mb-1.5" : "mb-1"
            }`}
          >
            <h3 className={`${c.fontHeading} ${c.productTitle} ${faded ? "opacity-60" : ""}`}>{productName}</h3>
            {!showVariants && (
              <PublicMenuPrice
                raw={product.price}
                theme={resolvedTheme}
                size="product"
              />
            )}
            {priceRange && (
              <span className="shrink-0 whitespace-nowrap" aria-label="Fiyat aralığı">
                <PublicMenuPrice raw={priceRange.min} theme={resolvedTheme} size="variant" />
                <span style={{ color: resolvedTheme.priceColor }}> – </span>
                <PublicMenuPrice raw={priceRange.max} theme={resolvedTheme} size="variant" />
              </span>
            )}
          </div>

          {showVariants && (
            <ul className={c.variantList} aria-label="Fiyat seçenekleri">
              {variants.map((variant) => {
                const label = getVariantLabel(variant, language);
                const hasPrice = parsePriceForDisplay(variant.price) != null;
                return (
                  <li key={variant.id} className={c.variantItem}>
                    <span className={c.variantLabel}>{label}</span>
                    {hasPrice ? (
                      <PublicMenuPrice
                        raw={variant.price}
                        theme={resolvedTheme}
                        size="variant"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {serviceNote && (
            <p className="mb-1 inline-block self-start rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
              {serviceNote}
            </p>
          )}

          {(soldOut || badges.length > 0) && (
            <div className="mb-1 flex flex-wrap gap-1">
              {soldOut && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                  {pickLang(language, { tr: "Tükendi", en: "Sold out", ru: "Нет в наличии" })}
                </span>
              )}
              {badges.map((badge) => (
                <span
                  key={badge.id}
                  className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-800"
                >
                  <span aria-hidden>{badge.icon}</span> {badge.label}
                </span>
              ))}
            </div>
          )}

          {description && (
            <p className={`${c.productDescription} ${faded ? "opacity-60" : ""}`}>{description}</p>
          )}

          {typeof product.calories === "number" && (
            <p className="mt-0.5 inline-block self-start rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-700">{product.calories} kcal</p>
          )}

          <PublicProductAllergens
            allergens={product.allergens}
            language={language}
            theme={resolvedTheme}
          />
        </div>
      </a>

      {detailOpen && (
      <ProductImageLightbox
        open={detailOpen}
        onClose={closeDetail}
        shareUrl={productUrl}
        productUrlFor={slug ? productUrlFor : undefined}
        product={product}
        theme={resolvedTheme}
        getText={getText}
        language={language}
      />
      )}
    </>
  );
}
