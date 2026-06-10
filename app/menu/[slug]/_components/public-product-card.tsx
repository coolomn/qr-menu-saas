"use client";

import { formatPriceForDisplay } from "@/lib/format-price";
import {
  hasProductVariants,
  type PublicProduct,
  type PublicProductVariant,
} from "@/lib/public-menu/product-variants";
import {
  resolveMenuPresentation,
  type ResolvedMenuPresentation,
} from "@/lib/public-menu/themes/resolve";

const ALLERGEN_OPTIONS = [
  { id: "gluten", label: "Gluten", icon: "🌾" },
  { id: "dairy", label: "Süt", icon: "🥛" },
  { id: "nuts", label: "Kuruyemiş", icon: "🥜" },
  { id: "seafood", label: "Deniz Ürünü", icon: "🦐" },
  { id: "egg", label: "Yumurta", icon: "🥚" },
  { id: "vegan", label: "Vegan", icon: "🌱" },
  { id: "spicy", label: "Acı", icon: "🌶️" },
];

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
  const resolvedTheme = theme ?? resolveMenuPresentation("classic", "classic");
  const c = resolvedTheme.classes;
  const priceColor = resolvedTheme.priceColor;

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const showVariants = hasProductVariants(variants);
  const productRecord = product as unknown as Record<string, unknown>;
  const description = getText(productRecord, "description");

  return (
    <div className={c.productCard}>
      {product.image_url && (
        <div className={c.productImageWrap}>
          <img
            src={product.image_url}
            alt={product.name || "Ürün Görseli"}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0 justify-center">
        <div
          className={`flex justify-between items-start gap-2 ${
            showVariants ? "mb-1.5" : "mb-1"
          }`}
        >
          <h3 className={`${c.fontHeading} ${c.productTitle}`}>
            {getText(productRecord, "name")}
          </h3>
          {!showVariants && (
            <span
              style={{ color: priceColor }}
              className={`${resolvedTheme.priceTypography.product} ${c.productPrice}`.trim()}
            >
              {formatPriceForDisplay(product.price)}
            </span>
          )}
        </div>

        {showVariants && (
          <ul className={c.variantList} aria-label="Fiyat seçenekleri">
            {variants.map((variant) => {
              const label = getVariantLabel(variant, language);
              const priceLabel = formatPriceForDisplay(variant.price);
              return (
                <li key={variant.id} className={c.variantItem}>
                  <span className={c.variantLabel}>{label}</span>
                  {priceLabel ? (
                    <span
                      style={{ color: priceColor }}
                      className={`${resolvedTheme.priceTypography.variant} ${c.variantPrice}`.trim()}
                    >
                      {priceLabel}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {description && <p className={c.productDescription}>{description}</p>}

        {product.allergens && product.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {product.allergens.map((aId: string) => {
              const alg = ALLERGEN_OPTIONS.find((a) => a.id === aId);
              return alg ? (
                <div key={aId} className={c.allergenBadge}>
                  <span className="text-[10px]">{alg.icon}</span>
                  <span className={c.allergenLabel}>{alg.label}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
