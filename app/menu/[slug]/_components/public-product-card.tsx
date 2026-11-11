"use client";

import { useState } from "react";
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

type PublicProductCardProps = {
  product: PublicProduct;
  theme: ResolvedMenuPresentation;
  getText: (item: Record<string, unknown>, field: string) => string;
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
}: PublicProductCardProps & { language?: string }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const resolvedTheme = theme ?? resolveMenuPresentation("classic", "classic");
  const c = resolvedTheme.classes;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const showVariants = hasProductVariants(variants);
  const productRecord = product as unknown as Record<string, unknown>;
  const productName = getText(productRecord, "name");
  const description = getText(productRecord, "description");
  const cardImageUrl = resolvePublicProductCardImageSrc(product);
  const soldOut = product.is_sold_out === true;
  const badges = resolveProductBadges(product.badges, language);

  return (
    <>
      <button
        type="button"
        className={`${c.productCard} w-full cursor-pointer text-left transition-opacity hover:opacity-95 active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`}
        onClick={() => setDetailOpen(true)}
        aria-label={productName ? `${productName} — detayları gör` : "Ürün detaylarını gör"}
      >
        {cardImageUrl && (
          <div className={`${c.productImageWrap} pointer-events-none`}>
            <img
              src={cardImageUrl}
              alt=""
              className={`w-full h-full object-cover ${soldOut ? "grayscale opacity-50" : ""}`}
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
            <h3 className={`${c.fontHeading} ${c.productTitle} ${soldOut ? "opacity-60" : ""}`}>{productName}</h3>
            {!showVariants && (
              <PublicMenuPrice
                raw={product.price}
                theme={resolvedTheme}
                size="product"
              />
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
            <p className={`${c.productDescription} ${soldOut ? "opacity-60" : ""}`}>{description}</p>
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
      </button>

      <ProductImageLightbox
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        product={product}
        theme={resolvedTheme}
        getText={getText}
        language={language}
      />
    </>
  );
}
