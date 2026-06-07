"use client";

import { formatPriceForDisplay } from "@/lib/format-price";
import {
  hasProductVariants,
  type PublicProduct,
  type PublicProductVariant,
} from "@/lib/public-menu/product-variants";

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
  themeColor: string;
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
  themeColor,
  getText,
  language = "tr",
}: PublicProductCardProps & { language?: string }) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const showVariants = hasProductVariants(variants);
  const productRecord = product as unknown as Record<string, unknown>;
  const description = getText(productRecord, "description");

  return (
    <div className="bg-white p-3 md:p-4 rounded-3xl shadow-sm border border-gray-100 flex gap-3 md:gap-4 hover:border-gray-200 transition-colors">
      {product.image_url && (
        <div className="w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-gray-100 rounded-2xl overflow-hidden shadow-inner relative self-start">
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
          <h3 className="font-black text-gray-900 leading-tight text-base md:text-lg min-w-0">
            {getText(productRecord, "name")}
          </h3>
          {!showVariants && (
            <span
              style={{ color: themeColor }}
              className="font-black text-lg md:text-xl whitespace-nowrap shrink-0"
            >
              {formatPriceForDisplay(product.price)}
            </span>
          )}
        </div>

        {showVariants && (
          <ul
            className="mb-2 rounded-xl border border-gray-100 bg-gray-50/80 divide-y divide-gray-100/90 overflow-hidden"
            aria-label="Fiyat seçenekleri"
          >
            {variants.map((variant) => {
              const label = getVariantLabel(variant, language);
              const priceLabel = formatPriceForDisplay(variant.price);
              return (
                <li
                  key={variant.id}
                  className="flex items-center justify-between gap-3 px-2.5 py-1.5 md:px-3 md:py-2"
                >
                  <span className="text-xs md:text-sm font-semibold text-gray-700 truncate min-w-0">
                    {label}
                  </span>
                  {priceLabel ? (
                    <span
                      style={{ color: themeColor }}
                      className="text-xs md:text-sm font-black tabular-nums whitespace-nowrap shrink-0"
                    >
                      {priceLabel}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {description && (
          <p className="text-xs md:text-sm text-gray-500 font-medium leading-snug mb-2 line-clamp-2">
            {description}
          </p>
        )}

        {product.allergens && product.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto">
            {product.allergens.map((aId: string) => {
              const alg = ALLERGEN_OPTIONS.find((a) => a.id === aId);
              return alg ? (
                <div
                  key={aId}
                  className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-lg"
                >
                  <span className="text-[10px]">{alg.icon}</span>
                  <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">
                    {alg.label}
                  </span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
