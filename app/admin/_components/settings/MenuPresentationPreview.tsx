"use client";

import { PublicProductCard } from "@/app/menu/[slug]/_components/public-product-card";
import { PublicRestaurantLogo } from "@/app/menu/[slug]/_components/public-restaurant-logo";
import type { FontStyleId } from "@/lib/public-menu/themes/font-ids";
import { FONT_STYLE_LABELS } from "@/lib/public-menu/themes/font-normalize";
import type { ThemeId } from "@/lib/public-menu/themes/ids";
import { THEME_ID_LABELS } from "@/lib/public-menu/themes/normalize";
import { resolveMenuPresentation } from "@/lib/public-menu/themes/resolve";
import type { PublicProduct } from "@/lib/public-menu/product-variants";

const PREVIEW_PRODUCT: PublicProduct = {
  id: "preview-product",
  category_id: "preview-cat",
  name: "Izgara Levrek",
  description: "Taze otlar ve limon sosu ile servis edilir.",
  price: "420",
  image_url: null,
  allergens: ["seafood"],
  variants: [],
};

type MenuPresentationPreviewProps = {
  appearance: ThemeId;
  font: FontStyleId;
  primaryColor: string;
  restaurantName: string;
  logoUrl: string | null;
};

export function MenuPresentationPreview({
  appearance,
  font,
  primaryColor,
  restaurantName,
  logoUrl,
}: MenuPresentationPreviewProps) {
  const theme = resolveMenuPresentation(appearance, font, primaryColor);
  const c = theme.classes;

  const getText = (item: Record<string, unknown>, field: string) => {
    const v = item[field];
    return typeof v === "string" ? v : "";
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-gray-500">
        {THEME_ID_LABELS[appearance]} görünüm · {FONT_STYLE_LABELS[font]} yazı stili
      </p>
      <div
        data-theme={appearance}
        data-font={font}
        style={
          {
            "--menu-accent": theme.brand,
            "--menu-price": theme.priceColor,
          } as React.CSSProperties
        }
        className={`rounded-2xl border-2 border-gray-200 overflow-hidden ${c.fontBody}`}
      >
        <div className={`${c.pageRoot.replace("min-h-screen", "min-h-0")} pb-3`}>
          <div className={c.header}>
            <div className={`${c.headerInner} py-3`}>
              <div className="w-7 flex-shrink-0" />
              <div className="flex-1 min-w-0 flex justify-center">
                <PublicRestaurantLogo
                  logoUrl={logoUrl}
                  restaurantName={restaurantName}
                  logoDisplayMode="light-card"
                  variant="header"
                  nameStyle={{ color: theme.brand }}
                  nameClassName={c.fontHeading}
                />
              </div>
              <div className={`${c.langSwitcher} !px-2.5 !py-1.5 !text-[10px]`}>
                <span className={c.langActive}>TR</span>
                <span className={c.langInactive}>EN</span>
                <span className={c.langInactive}>RU</span>
              </div>
            </div>
            <div className={`${c.categoryTabs} !py-2`}>
              <span
                className={`${c.categoryTabBase} ${c.categoryTabActiveExtra}`}
                style={{ backgroundColor: theme.tabActiveColor, color: "#fff" }}
              >
                Ana Yemek
              </span>
              <span className={`${c.categoryTabBase} ${c.categoryTabInactive}`}>İçecek</span>
              <span className={`${c.categoryTabBase} ${c.categoryTabInactive}`}>Tatlı</span>
            </div>
          </div>
          <div className={`${c.main} !mt-0`}>
            <PublicProductCard
              product={PREVIEW_PRODUCT}
              theme={theme}
              getText={getText}
              language="tr"
            />
          </div>
        </div>
      </div>
      <p className="text-[10px] font-medium text-gray-400">
        Fiyat rengi: <span className="font-mono">{theme.priceColor}</span>
        {theme.priceColor !== theme.brand ? (
          <span className="text-gray-500"> · Marka renginden bağımsız</span>
        ) : null}
      </p>
    </div>
  );
}
