"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MenuFontLoader } from "@/app/menu/[slug]/_components/menu-font-loader";
import { MenuThemeShell } from "@/app/menu/[slug]/_components/menu-theme-shell";
import { ProductDetailCard } from "@/app/menu/[slug]/_components/ProductImageLightbox";
import { PublicRestaurantLogo } from "@/app/menu/[slug]/_components/public-restaurant-logo";
import { usePublicMenuUrl, usePublicProductUrl } from "@/lib/domains/use-public-menu-url";
import type { PublicProductPageData } from "@/lib/public-menu/load-public-product";
import { resolveMenuPresentation } from "@/lib/public-menu/themes/resolve";
import { pickLang } from "@/lib/public-menu/venue-info";

const LANGS = ["tr", "en", "ru"] as const;

export function ProductPageClient({ slug, data }: { slug: string; data: PublicProductPageData }) {
  const { restaurant, category, product } = data;
  const [language, setLanguage] = useState<string>("tr");
  const menuUrl = usePublicMenuUrl()(slug);
  const shareUrl = usePublicProductUrl()(slug, product.id);

  const theme = resolveMenuPresentation(
    restaurant.theme_id,
    restaurant.font_style_id,
    restaurant.primary_color
  );
  const tc = theme.classes;

  const getText = (item: Record<string, unknown>, field: string): string => {
    const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    if (language === "en" && pick(item[`${field}_en`])) return pick(item[`${field}_en`]);
    if (language === "ru" && pick(item[`${field}_ru`])) return pick(item[`${field}_ru`]);
    const base = item[field];
    return typeof base === "string" ? base : "";
  };

  const categoryLabel = category
    ? getText(category as unknown as Record<string, unknown>, "name")
    : undefined;

  return (
    <MenuFontLoader fontStyleId={restaurant.font_style_id}>
      <MenuThemeShell theme={theme} entered>
        <header className={tc.header}>
          <div className={tc.headerInner}>
            <Link
              href={menuUrl}
              aria-label={pickLang(language, {
                tr: "Menüye dön",
                en: "Back to menu",
                ru: "Назад в меню",
              })}
              className={tc.backButton}
            >
              <ChevronLeft size={16} aria-hidden />
            </Link>
            <div className="flex-1 min-w-0 flex justify-center px-1">
              <PublicRestaurantLogo
                logoUrl={restaurant.logo_url}
                restaurantName={restaurant.name}
                logoDisplayMode={restaurant.logo_display_mode}
                variant="header"
                nameStyle={{ color: theme.tabActiveColor }}
                nameClassName={tc.fontHeading}
              />
            </div>
            <div className={tc.langSwitcher}>
              {LANGS.map((code) => (
                <span
                  key={code}
                  onClick={() => setLanguage(code)}
                  className={language === code ? tc.langActive : tc.langInactive}
                >
                  {code.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-4 px-4 py-6">
          <ProductDetailCard
            product={product}
            theme={theme}
            getText={getText}
            language={language}
            categoryLabel={categoryLabel}
            shareUrl={shareUrl}
          />
          <Link href={menuUrl} className={tc.emptyStateLink}>
            {pickLang(language, {
              tr: "Tüm menüyü gör",
              en: "See the full menu",
              ru: "Посмотреть всё меню",
            })}
          </Link>
        </main>
      </MenuThemeShell>
    </MenuFontLoader>
  );
}
