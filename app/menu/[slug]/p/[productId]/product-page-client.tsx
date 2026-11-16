"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MenuFontLoader } from "@/app/menu/[slug]/_components/menu-font-loader";
import { MenuThemeShell } from "@/app/menu/[slug]/_components/menu-theme-shell";
import { ProductDetailCard } from "@/app/menu/[slug]/_components/ProductImageLightbox";
import { ProductExtrasProvider } from "@/app/menu/[slug]/_components/product-extras-context";
import { PublicRestaurantLogo } from "@/app/menu/[slug]/_components/public-restaurant-logo";
import { usePublicMenuUrl, usePublicProductUrl } from "@/lib/domains/use-public-menu-url";
import type { PublicProductPageData } from "@/lib/public-menu/load-public-product";
import { resolveMenuPresentation } from "@/lib/public-menu/themes/resolve";
import { pickLang } from "@/lib/i18n/languages";
import { localizedText } from "@/lib/i18n/translations";
import { useMenuLanguage } from "@/lib/i18n/use-menu-language";
import { LanguageSwitcher } from "@/app/menu/[slug]/_components/language-switcher";
import {
  CurrencyNote,
  CurrencySelect,
  MenuCurrencyProvider,
  useMenuCurrency,
} from "@/app/menu/[slug]/_components/menu-currency";

export function ProductPageClient({ slug, data }: { slug: string; data: PublicProductPageData }) {
  const { restaurant, category, product } = data;
  const { language, setLanguage, languages } = useMenuLanguage(restaurant.menu_languages);
  const { rates: currencyRates, rate: currencyRate, setCurrency } = useMenuCurrency(
    restaurant.currency_rates,
    language
  );
  const menuUrl = usePublicMenuUrl()(slug);
  const productUrlOf = usePublicProductUrl();
  const shareUrl = productUrlOf(slug, product.id);

  const theme = resolveMenuPresentation(
    restaurant.theme_id,
    restaurant.font_style_id,
    restaurant.primary_color
  );
  const tc = theme.classes;

  const getText = (item: Record<string, unknown>, field: string): string =>
    localizedText(item, field, language);

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
                de: "Zurück zur Speisekarte",
                fr: "Retour au menu",
                es: "Volver al menú",
                it: "Torna al menù",
                uk: "Назад до меню",
                zh: "返回菜单",
                az: "Menyuya qayıt",
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
            <LanguageSwitcher
              languages={languages}
              value={language}
              onChange={setLanguage}
              className={tc.langSwitcher}
              activeClassName={tc.langActive}
              inactiveClassName={tc.langInactive}
            />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-4 px-4 py-6">
          <MenuCurrencyProvider rate={currencyRate} language={language}>
          <ProductExtrasProvider groups={data.modifierGroups} products={data.pairingProducts}>
            <ProductDetailCard
              product={product}
              theme={theme}
              getText={getText}
              language={language}
              categoryLabel={categoryLabel}
              shareUrl={shareUrl}
              pairingHref={(id) => productUrlOf(slug, id)}
            />
          </ProductExtrasProvider>
          {currencyRates.length > 0 ? (
            <div className="flex w-full flex-col items-center gap-2 text-center">
              <CurrencySelect
                rates={currencyRates}
                value={currencyRate}
                onChange={setCurrency}
                language={language}
                className="rounded-full border border-current/20 bg-transparent px-3 py-1.5 text-xs font-bold"
              />
              <div className={tc.emptyStateText}>
                <CurrencyNote />
              </div>
            </div>
          ) : null}
          </MenuCurrencyProvider>
          <Link href={menuUrl} className={tc.emptyStateLink}>
            {pickLang(language, {
              tr: "Tüm menüyü gör",
              en: "See the full menu",
              ru: "Посмотреть всё меню",
              de: "Ganze Speisekarte ansehen",
              fr: "Voir tout le menu",
              es: "Ver el menú completo",
              it: "Vedi tutto il menù",
              uk: "Переглянути все меню",
              zh: "查看完整菜单",
              az: "Bütün menyuya bax",
            })}
          </Link>
        </main>
      </MenuThemeShell>
    </MenuFontLoader>
  );
}
