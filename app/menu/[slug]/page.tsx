"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Menu as MenuIcon, UtensilsCrossed, X } from "lucide-react";
import { MenuPickScreen } from "@/app/menu/[slug]/_components/menu-pick-screen";
import { PublicMenuBackgroundImage } from "@/app/menu/[slug]/_components/public-menu-background-image";
import {
  MenuFontLoader,
  prefetchMenuFontShell,
} from "@/app/menu/[slug]/_components/menu-font-loader";
import {
  categoryBelongsToMenuCollection,
  productBelongsToMenuCollection,
} from "@/lib/public-menu/display";
import type { PublicMenuCollection, PublicMenuPicker } from "@/lib/public-menu/menu-collections";
import { MULTI_MENU_PROTOTYPE_ENABLED } from "@/lib/menu-prototype/config";
import { PublicRestaurantLogo } from "@/app/menu/[slug]/_components/public-restaurant-logo";
import { QrLabelBadge } from "@/app/menu/[slug]/_components/qr-label-badge";
import { PublicMenuSlider } from "@/app/menu/[slug]/_components/public-menu-slider";
import { MenuThemeShell } from "@/app/menu/[slug]/_components/menu-theme-shell";
import { PublicProductCard } from "@/app/menu/[slug]/_components/public-product-card";
import { ProductExtrasProvider } from "@/app/menu/[slug]/_components/product-extras-context";
import type { PublicModifierGroup } from "@/lib/public-menu/product-extras";
import { MenuFilterBar } from "@/app/menu/[slug]/_components/menu-filter-bar";
import { childrenByParent, isTopLevelCategory } from "@/lib/public-menu/category-tree";
import {
  applyMenuFilter,
  availableFilterOptions,
  EMPTY_MENU_FILTER,
  type MenuFilterState,
} from "@/lib/public-menu/menu-filters";
import {
  effectiveMenuPicker,
  menuServiceNotes,
  resolveCategoryService,
  resolveCategoryServiceWithParent,
  resolveProductService,
  serviceNote,
  visibleMenuCollections,
} from "@/lib/public-menu/service-view";
import {
  PublicPriceDateNote,
  PublicVenueActions,
} from "@/app/menu/[slug]/_components/public-venue-info";
import {
  normalizePublicProducts,
  type PublicProduct,
} from "@/lib/public-menu/product-variants";
import {
  applyMenuNavigationIntent,
  getPublicMenuBootstrap,
  getPublicMenuContent,
  type MenuNavigationIntent,
  menuCollectionsFromBootstrap,
  menuPickerFromBootstrap,
  shouldPrefetchPublicMenuContent,
} from "@/lib/public-menu/public-menu-client";
import type { PublicCategoryPayload } from "@/lib/public-menu/load-public-menu";
import { resolveMenuPresentation } from "@/lib/public-menu/themes/resolve";
import { pickLang, toMenuLanguage } from "@/lib/i18n/languages";
import { translatedText } from "@/lib/i18n/translations";
import { menuLabelFallback } from "@/lib/i18n/menu-label-fallback";
import { useMenuLanguage } from "@/lib/i18n/use-menu-language";
import { LanguageSwitcher } from "@/app/menu/[slug]/_components/language-switcher";
import { MenuCurrencyProvider, useMenuCurrency } from "@/app/menu/[slug]/_components/menu-currency";

type PublicCategory = PublicCategoryPayload;

function MenuContentErrorBanner({
  language,
  onRetry,
}: {
  language: string;
  onRetry: () => void;
}) {
  const message = pickLang(language, {
    tr: "Menü yüklenemedi. Tekrar deneyin.",
    en: "Menu could not be loaded. Please try again.",
    ru: "Не удалось загрузить меню. Попробуйте снова.",
    de: "Die Speisekarte konnte nicht geladen werden. Bitte erneut versuchen.",
    fr: "Impossible de charger le menu. Veuillez réessayer.",
    es: "No se pudo cargar el menú. Inténtelo de nuevo.",
    it: "Impossibile caricare il menù. Riprova.",
    uk: "Не вдалося завантажити меню. Спробуйте ще раз.",
    zh: "菜单加载失败，请重试。",
    az: "Menyu yüklənmədi. Yenidən cəhd edin.",
  });
  const retryLabel = pickLang(language, {
    tr: "Tekrar dene",
    en: "Retry",
    ru: "Повторить",
    de: "Erneut versuchen",
    fr: "Réessayer",
    es: "Reintentar",
    it: "Riprova",
    uk: "Повторити",
    zh: "重试",
    az: "Yenidən cəhd et",
  });

  return (
    <div className="rounded-2xl border border-red-200/80 bg-red-50/95 px-4 py-3 text-center shadow-sm">
      <p className="text-sm font-bold text-red-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-sm font-black uppercase tracking-wide text-red-700 underline underline-offset-4"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8A3.6 3.6 0 0 0 20 16.4V7.6A3.6 3.6 0 0 0 16.4 4H7.6m9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10m0 2a3 3 0 1 0 .001 6.001A3 3 0 0 0 12 9z" />
    </svg>
  );
}

function instagramProfileUrl(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  let t = raw.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) {
    if (/^www\.instagram\.com\//i.test(t) || /^instagram\.com\//i.test(t)) {
      t = `https://${t}`;
    }
  }
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return t;
      const parts = u.pathname.split("/").filter(Boolean);
      const user = parts[0];
      if (user && !["p", "reel", "reels", "stories", "explore"].includes(user))
        return `https://www.instagram.com/${encodeURIComponent(user)}/`;
      return t;
    } catch {
      return null;
    }
  }
  const user = t.replace(/^@/, "").split("/")[0].split("?")[0].trim();
  if (!user) return null;
  return `https://www.instagram.com/${encodeURIComponent(user)}/`;
}

function instagramOpenContext(
  raw: string | null | undefined
): { webUrl: string; appUsername: string | null } | null {
  const webUrl = instagramProfileUrl(raw);
  if (!webUrl) return null;
  try {
    const u = new URL(webUrl);
    if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, "")))
      return { webUrl, appUsername: null };
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length !== 1) return { webUrl, appUsername: null };
    const user = parts[0];
    if (!user || ["p", "reel", "reels", "stories", "explore"].includes(user))
      return { webUrl, appUsername: null };
    return { webUrl, appUsername: decodeURIComponent(user) };
  } catch {
    return { webUrl, appUsername: null };
  }
}

function isIOSMobileClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function MenuUnavailableScreen() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#F5F1EB] px-6"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#E5DFD3]/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[#1F3B2B]/10 blur-3xl" />

      <div className="relative z-10 flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#E5DFD3] shadow-lg">
          <UtensilsCrossed className="h-9 w-9 text-[#1F3B2B]/70" strokeWidth={2.5} aria-hidden />
        </div>
        <div className="space-y-3">
          <h1 className="text-xl font-black tracking-tight text-[#1F3B2B] sm:text-2xl">
            Menü şu anda kullanılamıyor
          </h1>
          <p className="text-sm leading-relaxed text-[#1F3B2B]/75 sm:text-base">
            Bu dijital menü geçici olarak kapalıdır. Lütfen daha sonra tekrar deneyin veya işletme ile
            iletişime geçin.
          </p>
        </div>
      </div>
    </div>
  );
}

function MenuLoadingScreen() {
  return (
    <div
      className="relative h-screen flex flex-col items-center justify-center overflow-hidden bg-[#F5F1EB]"
      role="status"
      aria-live="polite"
      aria-label="Menü hazırlanıyor"
    >
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#E5DFD3]/60 blur-3xl animate-pulse" />
      <div
        className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-[#1F3B2B]/10 blur-3xl animate-pulse"
        style={{ animationDelay: "600ms" }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-4 border-[#E5DFD3]" />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#1F3B2B]" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[#E5DFD3] shadow-lg animate-[menu-icon-pop_2s_ease-in-out_infinite]">
            <UtensilsCrossed className="h-7 w-7 text-[#1F3B2B]" strokeWidth={2.5} aria-hidden />
          </span>
        </div>

        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-[#1F3B2B] sm:text-base">
            Menü Hazırlanıyor
          </p>
          <div className="flex items-center gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full bg-[#1F3B2B] animate-bounce"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-14 left-1/2 h-1 w-44 -translate-x-1/2 overflow-hidden rounded-full bg-[#E5DFD3]">
        <div className="h-full w-1/2 rounded-full bg-[#1F3B2B] animate-[menu-loading-bar_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

function openInstagramIOSAggressive(webUrl: string, username: string) {
  const appUrl = `instagram://user?username=${encodeURIComponent(username)}`;
  let leftPage = false;
  let timer: number;
  const onAway = () => {
    leftPage = true;
    window.clearTimeout(timer);
  };
  timer = window.setTimeout(() => {
    if (!leftPage) window.location.assign(webUrl);
  }, 1400) as unknown as number;
  window.addEventListener("pagehide", onAway, { once: true });
  window.addEventListener("blur", onAway, { once: true });
  window.location.href = appUrl;
}

export default function CustomerMenu() {
  const params = useParams();
  const slug = params?.slug;

  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [modifierGroups, setModifierGroups] = useState<PublicModifierGroup[]>([]);
  const [menuCollections, setMenuCollections] = useState<PublicMenuCollection[]>([]);
  const [menuPicker, setMenuPicker] = useState<PublicMenuPicker | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [menuDataLoading, setMenuDataLoading] = useState(false);
  const [menuDataLoaded, setMenuDataLoaded] = useState(false);
  const [menuDataError, setMenuDataError] = useState<string | null>(null);
  const [menuUnavailable, setMenuUnavailable] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<MenuNavigationIntent>(null);

  const menuDataLoadedRef = useRef(false);
  const menuDataLoadingRef = useRef(false);

  // Faz 2.5: işletmenin açtığı diller; restoran yüklenene kadar TR.
  const {
    language,
    setLanguage,
    languages: menuLanguages,
  } = useMenuLanguage(restaurant ? (restaurant.menu_languages ?? null) : undefined);
  // Faz 2.5c: "≈ €12" için seçili döviz (işletme döviz açmadıysa hiç görünmez).
  const {
    rates: currencyRates,
    rate: currencyRate,
    setCurrency,
  } = useMenuCurrency(restaurant?.currency_rates, language);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [menuFilter, setMenuFilter] = useState<MenuFilterState>(EMPTY_MENU_FILTER);

  const [view, setView] = useState<"welcome" | "menu">("welcome");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [menuMainGroup, setMenuMainGroup] = useState<string | null>(null);
  const [selectedMenuCollectionId, setSelectedMenuCollectionId] = useState<string | null>(null);
  const [menuViewEntered, setMenuViewEntered] = useState(false);

  // Faz 2.3: zamanlama müşteri saatine değil mekan saatine (İstanbul) göre, dakikada bir yenilenir.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleCollections = useMemo(
    () => visibleMenuCollections(menuCollections, now),
    [menuCollections, now]
  );
  const effectivePicker = useMemo(
    () => effectiveMenuPicker(menuPicker, visibleCollections),
    [menuPicker, visibleCollections]
  );

  const useCollectionFlow = MULTI_MENU_PROTOTYPE_ENABLED;
  const showMenuPicker = useCollectionFlow && Boolean(effectivePicker?.enabled);

  const loadMenuContent = useCallback(async (): Promise<boolean> => {
    const slugValue = Array.isArray(slug) ? slug[0] : slug;
    if (!slugValue) return false;
    if (menuDataLoadedRef.current || menuDataLoadingRef.current) {
      return menuDataLoadedRef.current;
    }

    menuDataLoadingRef.current = true;
    setMenuDataLoading(true);
    setMenuDataError(null);

    try {
      const result = await getPublicMenuContent(slugValue);
      if (result.status === 403) {
        setMenuUnavailable(true);
        return false;
      }
      if (!result.data) {
        setMenuDataError("Menü yüklenemedi. Tekrar deneyin.");
        return false;
      }

      setCategories(result.data.categories);
      setProducts(normalizePublicProducts(result.data.products));
      setModifierGroups(result.data.modifier_groups ?? []);
      menuDataLoadedRef.current = true;
      setMenuDataLoaded(true);
      return true;
    } catch (error) {
      console.error(error);
      setMenuDataError("Menü yüklenemedi. Tekrar deneyin.");
      return false;
    } finally {
      menuDataLoadingRef.current = false;
      setMenuDataLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const slugValue = Array.isArray(slug) ? slug[0] : slug;
    if (!slugValue) {
      setBootstrapLoading(false);
      return;
    }

    menuDataLoadedRef.current = false;
    menuDataLoadingRef.current = false;
    setMenuDataLoaded(false);
    setMenuDataLoading(false);
    setMenuDataError(null);
    setPendingNavigation(null);
    setCategories([]);
    setProducts([]);
    setModifierGroups([]);
    setView("welcome");
    setSelectedMenuCollectionId(null);
    setMenuMainGroup(null);
    setActiveCategory(null);

    const loadBootstrap = async () => {
      try {
        setMenuUnavailable(false);
        const result = await getPublicMenuBootstrap(slugValue);

        if (result.status === 403) {
          setMenuUnavailable(true);
          setRestaurant(null);
          setMenuCollections([]);
          setMenuPicker(null);
          return;
        }

        if (!result.data) {
          setRestaurant(null);
          setMenuCollections([]);
          setMenuPicker(null);
          return;
        }

        const picker = menuPickerFromBootstrap(result.data.menu_picker);
        const collections = menuCollectionsFromBootstrap(result.data.menu_collections);

        setRestaurant(result.data.restaurant || null);
        setMenuCollections(collections);
        setMenuPicker(picker);
        prefetchMenuFontShell(result.data.restaurant?.font_style_id);

        if (shouldPrefetchPublicMenuContent({ useCollectionFlow, menuPicker: picker })) {
          void loadMenuContent();
        }

        if (useCollectionFlow && picker.enabled) {
          setView("welcome");
          setSelectedMenuCollectionId(null);
        } else if (!useCollectionFlow) {
          setView("welcome");
          setSelectedMenuCollectionId(null);
        }
      } catch (error) {
        console.error(error);
        setRestaurant(null);
        setMenuCollections([]);
        setMenuPicker(null);
      } finally {
        setBootstrapLoading(false);
      }
    };

    void loadBootstrap();
  }, [slug, useCollectionFlow, loadMenuContent]);

  // "Gizle" modundaki menüler yüzünden seçim ekranı kalktıysa içerik önceden yüklenmemiş olabilir.
  useEffect(() => {
    if (!useCollectionFlow || !effectivePicker || effectivePicker.enabled) return;
    void loadMenuContent();
  }, [useCollectionFlow, effectivePicker, loadMenuContent]);

  useEffect(() => {
    if (!menuDataLoaded || !effectivePicker) return;
    if (useCollectionFlow && !effectivePicker.enabled) {
      setSelectedMenuCollectionId(effectivePicker.default_menu_collection_id);
      setView("menu");
    }
  }, [menuDataLoaded, effectivePicker, useCollectionFlow]);

  useEffect(() => {
    if (!menuDataLoaded || !pendingNavigation) return;
    applyMenuNavigationIntent(pendingNavigation, {
      setSelectedMenuCollectionId,
      setMenuMainGroup,
      setActiveCategory,
      setView,
    });
    setPendingNavigation(null);
  }, [menuDataLoaded, pendingNavigation]);

  const categoryGroupKey = (cat: { main_group?: string | null }) => cat.main_group || "DİĞER";

  const filterByMenuCollection = useCollectionFlow && Boolean(selectedMenuCollectionId);

  const categoryById = useMemo(() => {
    const map = new Map<string, PublicCategory>();
    for (const cat of categories) map.set(cat.id, cat);
    return map;
  }, [categories]);

  const selectedMenu = useMemo(
    () =>
      selectedMenuCollectionId
        ? (menuCollections.find((m) => m.id === selectedMenuCollectionId) ?? null)
        : null,
    [menuCollections, selectedMenuCollectionId]
  );

  const productsInSelectedMenu = useMemo(() => {
    const inMenu =
      !filterByMenuCollection || !selectedMenuCollectionId
        ? products
        : products.filter((p: { category_id: string; menu_collection_ids?: string[] }) => {
            const cat = categoryById.get(p.category_id);
            return productBelongsToMenuCollection(p, selectedMenuCollectionId, cat);
          });
    // Faz 2.3: "servis dışında gizle" seçilmiş menü/kategori/ürünler listeden çıkar.
    return inMenu.filter((p) => {
      const cat = categoryById.get(p.category_id);
      const parent = cat?.parent_id ? categoryById.get(cat.parent_id) : undefined;
      return resolveProductService(p, cat, selectedMenu, now, parent).visible;
    });
  }, [products, filterByMenuCollection, selectedMenuCollectionId, categoryById, selectedMenu, now]);

  const subcategoriesByParent = useMemo(() => childrenByParent(categories), [categories]);

  /** Sekmelerde yalnız üst kategoriler; alt kategoriler üst kategorinin sayfasında listelenir. */
  const menuCategories = useMemo(() => {
    let list = categories.filter(isTopLevelCategory);
    if (menuMainGroup != null) {
      list = list.filter((c) => categoryGroupKey(c) === menuMainGroup);
    }
    list = list.filter((c) => resolveCategoryService(c, selectedMenu, now).visible);
    if (filterByMenuCollection && selectedMenuCollectionId) {
      const withSubs = (c: PublicCategory) => [c, ...(subcategoriesByParent.get(c.id) ?? [])];
      list = list.filter((c) =>
        withSubs(c).some((x) => categoryBelongsToMenuCollection(x, selectedMenuCollectionId))
      );
      const categoriesWithProducts = new Set(
        productsInSelectedMenu.map((p: { category_id: string }) => p.category_id)
      );
      list = list.filter((c) => withSubs(c).some((x) => categoriesWithProducts.has(x.id)));
    }
    return list;
  }, [
    categories,
    subcategoriesByParent,
    menuMainGroup,
    filterByMenuCollection,
    selectedMenuCollectionId,
    productsInSelectedMenu,
    selectedMenu,
    now,
  ]);

  const menuCategoryIds = useMemo(
    () => new Set(menuCategories.map((c) => c.id)),
    [menuCategories]
  );

  const visibleProducts = useMemo(() => {
    if (!activeCategory) return [];
    return productsInSelectedMenu.filter(
      (p: { category_id: string }) =>
        menuCategoryIds.has(p.category_id) && p.category_id === activeCategory
    );
  }, [productsInSelectedMenu, activeCategory, menuCategoryIds]);

  /** Etkin üst kategorinin alt kategorileri ve ürünleri (ürünü olmayan alt kategori gösterilmez). */
  const visibleSubsections = useMemo(() => {
    if (!activeCategory || !menuCategoryIds.has(activeCategory)) return [];
    return (subcategoriesByParent.get(activeCategory) ?? [])
      .map((sub) => ({
        category: sub,
        products: productsInSelectedMenu.filter(
          (p: { category_id: string }) => p.category_id === sub.id
        ),
      }))
      .filter((section) => section.products.length > 0);
  }, [activeCategory, menuCategoryIds, subcategoriesByParent, productsInSelectedMenu]);

  const filterOptions = useMemo(
    () => availableFilterOptions(productsInSelectedMenu),
    [productsInSelectedMenu]
  );

  const activeCategoryServiceNote = useMemo(() => {
    if (!activeCategory) return null;
    return serviceNote(
      resolveCategoryService(categoryById.get(activeCategory), selectedMenu, now),
      language,
      now
    );
  }, [activeCategory, categoryById, selectedMenu, now, language]);

  /** Faz 2.3: ürün kartı için servis durumu (alt kategoride üst kategorinin zamanlaması da geçerli). */
  const productServiceProps = (product: PublicProduct) => {
    const cat = categoryById.get(product.category_id);
    const parent = cat?.parent_id ? categoryById.get(cat.parent_id) : undefined;
    const service = resolveProductService(product, cat, selectedMenu, now, parent);
    return {
      outOfService: service.outside !== null,
      serviceNote: service.outside?.level === "product" ? serviceNote(service, language, now) : null,
    };
  };

  useEffect(() => {
    if (view !== "menu") return;
    if (menuCategories.length === 0) {
      setActiveCategory(null);
      return;
    }
    setActiveCategory((prev) => {
      if (prev && menuCategories.some((c) => c.id === prev)) return prev;
      return menuCategories[0].id;
    });
  }, [menuCategories, view, selectedMenuCollectionId]);

  useEffect(() => {
    if (view !== "menu") {
      setMenuViewEntered(false);
      return;
    }
    const t = window.requestAnimationFrame(() => setMenuViewEntered(true));
    return () => window.cancelAnimationFrame(t);
  }, [view, selectedMenuCollectionId]);

  const openMenuCollection = (menuCollectionId: string) => {
    setPendingNavigation({ kind: "menu", menuCollectionId });
    void loadMenuContent();
  };

  const retryMenuContent = () => {
    if (menuDataLoadingRef.current) return;
    menuDataLoadedRef.current = false;
    setMenuDataLoaded(false);
    void loadMenuContent();
  };

  const navigateLegacyCategory = (groupName: string, categoryId: string) => {
    setPendingNavigation({
      kind: "menu",
      menuCollectionId: selectedMenuCollectionId,
      mainGroup: groupName,
      categoryId,
    });
    void loadMenuContent();
  };

  const backToMenuPick = () => {
    setView("welcome");
    setMenuMainGroup(null);
    setSelectedMenuCollectionId(null);
  };

  const waitingForInitialMenuData =
    useCollectionFlow &&
    Boolean(effectivePicker && !effectivePicker.enabled) &&
    !menuDataLoaded &&
    !menuDataError;

  if (bootstrapLoading || waitingForInitialMenuData) return <MenuLoadingScreen />;
  if (menuUnavailable) return <MenuUnavailableScreen />;
  if (!restaurant) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F5F1EB] px-6 text-center font-bold text-[#1F3B2B] text-lg">
        Restoran bulunamadı.
      </div>
    );
  }

  const menuTheme = resolveMenuPresentation(
    restaurant.theme_id,
    restaurant.font_style_id,
    restaurant.primary_color
  );
  const themeColor = menuTheme.tabActiveColor;
  const tc = menuTheme.classes;
  const getText = (item: any, field: string) => {
    const translated = translatedText(item, field, language);
    if (translated) return translated;
    const base = item[field];
    if (typeof base === "string" && (field === "name" || field === "main_group")) {
      const fallback = menuLabelFallback(base, toMenuLanguage(language));
      if (fallback) return fallback;
    }
    return base;
  };

  const backToPickLabel = pickLang(language, {
    tr: "Menü seçimine dön",
    en: "Back to menu selection",
    ru: "К выбору меню",
    de: "Zurück zur Menüauswahl",
    fr: "Retour au choix du menu",
    es: "Volver a la selección de menú",
    it: "Torna alla scelta del menù",
    uk: "До вибору меню",
    zh: "返回菜单选择",
    az: "Menyu seçiminə qayıt",
  });

  const getGroupLabel = (groupKey: string, cats: PublicCategory[]) => {
    const sample = cats[0];
    if (!sample) return groupKey;
    const trLabel = sample.main_group || groupKey;
    return getText({ ...sample, main_group: trLabel }, "main_group");
  };

  const groupedCategories = categories.filter(isTopLevelCategory).reduce(
    (acc, cat) => {
      const group = cat.main_group || "DİĞER";
      if (!acc[group]) acc[group] = [];
      acc[group].push(cat);
      return acc;
    },
    {} as Record<string, PublicCategory[]>
  );

  const instagramCtx = instagramOpenContext(restaurant.instagram);

  const wrapWithMenuFonts = (node: React.ReactNode) => (
    <MenuFontLoader fontStyleId={restaurant.font_style_id}>{node}</MenuFontLoader>
  );

  if (view === "welcome" && useCollectionFlow && showMenuPicker) {
    const instagramFollowLabel = pickLang(language, {
      tr: "Takip edin",
      en: "Follow us",
      ru: "Подпишитесь",
      de: "Folgen Sie uns",
      fr: "Suivez-nous",
      es: "Síguenos",
      it: "Seguici",
      uk: "Підписуйтесь",
      zh: "关注我们",
      az: "Bizi izləyin",
    });

    return wrapWithMenuFonts(
      <div className="relative min-h-[100dvh]">
        <MenuPickScreen
          restaurantName={restaurant.name}
          logoUrl={restaurant.logo_url}
          logoDisplayMode={restaurant.logo_display_mode}
          welcomeBgUrl={restaurant.welcome_bg_url}
          language={language}
          languages={menuLanguages}
          onLanguageChange={setLanguage}
          menuCollections={visibleCollections}
          serviceNotes={menuServiceNotes(visibleCollections, language, now)}
          onSelectCollection={openMenuCollection}
          instagramCtx={instagramCtx}
          instagramLabel={instagramFollowLabel}
          onInstagramClick={(e) => {
            const u = instagramCtx?.appUsername;
            if (!u || !isIOSMobileClient()) return;
            e.preventDefault();
            openInstagramIOSAggressive(instagramCtx!.webUrl, u);
          }}
        />
        <PublicVenueActions restaurant={restaurant} language={language} accentColor={themeColor} />
        {menuDataLoading && pendingNavigation ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex justify-center px-6">
            <p className="rounded-full bg-black/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white">
              {pickLang(language, {
                tr: "Menü yükleniyor...",
                en: "Loading menu...",
                ru: "Загрузка меню...",
                de: "Speisekarte wird geladen...",
                fr: "Chargement du menu...",
                es: "Cargando el menú...",
                it: "Caricamento del menù...",
                uk: "Завантаження меню...",
                zh: "菜单加载中...",
                az: "Menyu yüklənir...",
              })}
            </p>
          </div>
        ) : null}
        {menuDataError ? (
          <div className="absolute inset-x-0 bottom-6 z-20 px-6">
            <MenuContentErrorBanner language={language} onRetry={retryMenuContent} />
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "welcome" && !useCollectionFlow) {
    return wrapWithMenuFonts(
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-between bg-stone-900 font-sans">
        <PublicMenuBackgroundImage src={restaurant.welcome_bg_url} />
        <div className="pointer-events-none absolute inset-0 z-[1] bg-black/30" />
        <PublicVenueActions restaurant={restaurant} language={language} accentColor={themeColor} />

        <div className="relative z-10 w-full p-6 flex justify-end">
          <LanguageSwitcher
            languages={menuLanguages}
            value={language}
            onChange={setLanguage}
            className="bg-white px-4 py-2 rounded-xl text-sm font-black text-gray-900 shadow-lg cursor-pointer flex gap-3"
            activeClassName="text-black"
            inactiveClassName="opacity-40 grayscale"
          />
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full px-6">
          <PublicRestaurantLogo
            logoUrl={restaurant.logo_url}
            restaurantName={restaurant.name}
            logoDisplayMode={restaurant.logo_display_mode}
            variant="hero"
            nameClassName="text-white"
          />
          <QrLabelBadge
            language={language}
            className="mt-4 inline-flex items-center rounded-full bg-white/90 px-4 py-1.5 text-sm font-black uppercase tracking-wide text-gray-900 shadow"
          />
        </div>

        <div className="relative z-10 w-full max-w-md mx-auto px-6 pb-12 space-y-3">
          {!menuDataLoaded && !menuDataError ? (
            <div className="rounded-2xl bg-[#E5DFD3]/90 px-6 py-5 text-center shadow-lg">
              <p className="text-sm font-black uppercase tracking-widest text-[#1F3B2B]">
                {pickLang(language, {
                tr: "Menü yükleniyor...",
                en: "Loading menu...",
                ru: "Загрузка меню...",
                de: "Speisekarte wird geladen...",
                fr: "Chargement du menu...",
                es: "Cargando el menú...",
                it: "Caricamento del menù...",
                uk: "Завантаження меню...",
                zh: "菜单加载中...",
                az: "Menyu yüklənir...",
              })}
              </p>
            </div>
          ) : null}
          {menuDataError ? (
            <MenuContentErrorBanner language={language} onRetry={retryMenuContent} />
          ) : null}
          {menuDataLoaded
            ? (Object.entries(groupedCategories) as [string, PublicCategory[]][]).map(
                ([groupName, cats]) => {
              const isExpanded = expandedGroup === groupName;
              return (
                <div key={groupName} className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : groupName)}
                    className="w-full bg-[#E5DFD3] text-[#1F3B2B] flex items-center justify-between px-6 py-5 rounded-lg font-black text-lg tracking-widest uppercase shadow-lg active:scale-[0.98] transition-transform"
                  >
                    <span>{getGroupLabel(groupName, cats)}</span>
                    {isExpanded ? <X size={24} strokeWidth={3} /> : <MenuIcon size={24} strokeWidth={3} />}
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                      {cats.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => navigateLegacyCategory(groupName, cat.id)}
                          className="w-full bg-[#E5DFD3] text-[#1F3B2B] py-4 rounded-lg font-bold text-base tracking-widest uppercase shadow-md active:scale-[0.98] transition-transform opacity-95"
                        >
                          {getText(cat, "name")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
              )
            : null}
          {instagramCtx && (
            <footer className="pt-8 mt-2 border-t border-white/25 text-center">
              <p className="mb-3 text-[11px] sm:text-xs font-black uppercase tracking-[0.22em] text-white/95 drop-shadow-sm">
                {pickLang(language, {
                  tr: "Şimdi Takip Edin",
                  en: "Follow us now",
                  ru: "Подпишитесь на нас",
                  de: "Jetzt folgen",
                  fr: "Suivez-nous",
                  es: "Síguenos ahora",
                  it: "Seguici ora",
                  uk: "Підпишіться на нас",
                  zh: "立即关注我们",
                  az: "İndi bizi izləyin",
                })}
              </p>
              <a
                href={instagramCtx.webUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  const u = instagramCtx.appUsername;
                  if (!u || !isIOSMobileClient()) return;
                  e.preventDefault();
                  openInstagramIOSAggressive(instagramCtx.webUrl, u);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white/15 px-4 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg backdrop-blur-md transition hover:bg-white/25 active:scale-[0.99]"
              >
                <InstagramGlyph className="h-5 w-5 shrink-0" />
                Instagram
              </a>
            </footer>
          )}
        </div>
      </div>
    );
  }

  if (view === "menu" && !menuDataLoaded) {
    return <MenuLoadingScreen />;
  }

  const shownProducts = applyMenuFilter(visibleProducts, menuFilter, (product) =>
    getText(product, "name")
  );
  const shownSubsections = visibleSubsections
    .map((section) => ({
      ...section,
      products: applyMenuFilter(section.products, menuFilter, (product) => getText(product, "name")),
    }))
    .filter((section) => section.products.length > 0);
  const activeCategoryRow = activeCategory ? categoryById.get(activeCategory) : undefined;
  const activeCategoryNote = activeCategoryRow ? getText(activeCategoryRow, "note") : "";
  const hasAnyTabProducts =
    visibleProducts.length > 0 || visibleSubsections.length > 0;
  const hasAnyShownProducts = shownProducts.length > 0 || shownSubsections.length > 0;

  return wrapWithMenuFonts(
    <ProductExtrasProvider groups={modifierGroups} products={products}>
    <MenuCurrencyProvider rate={currencyRate} language={language}>
    <MenuThemeShell theme={menuTheme} entered={menuViewEntered}>
      <header className={tc.header}>
        <div className={tc.headerInner}>
          {showMenuPicker ? (
            <button
              type="button"
              aria-label={backToPickLabel}
              onClick={backToMenuPick}
              className={tc.backButton}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
          ) : (
            <div className="w-9 flex-shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0 flex justify-center px-1">
            <PublicRestaurantLogo
              logoUrl={restaurant.logo_url}
              restaurantName={restaurant.name}
              logoDisplayMode={restaurant.logo_display_mode}
              variant="header"
              nameStyle={{ color: themeColor }}
              nameClassName={tc.fontHeading}
            />
          </div>
          <LanguageSwitcher
            languages={menuLanguages}
            value={language}
            onChange={setLanguage}
            className={tc.langSwitcher}
            activeClassName={tc.langActive}
            inactiveClassName={tc.langInactive}
          />
        </div>

        <PublicMenuSlider
          images={restaurant.slider_images ?? []}
          enabled={view === "menu"}
          sliderSectionClass={tc.sliderSection}
          sliderInnerClass={tc.sliderInner}
          sliderFrameClass={tc.sliderFrame}
        />

        {menuCategories.length > 0 && (
          <div className={tc.categoryTabs}>
            {menuCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={activeCategory === cat.id ? { backgroundColor: themeColor, color: "#fff" } : {}}
                className={`${tc.categoryTabBase} ${
                  activeCategory === cat.id ? tc.categoryTabActiveExtra : tc.categoryTabInactive
                }`}
              >
                {getText(cat, "name")}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className={tc.main}>
        <QrLabelBadge language={language} style={{ color: themeColor, borderColor: themeColor }} centered />
        {menuCategories.length === 0 && filterByMenuCollection && (
          <div className="text-center py-12 px-4 space-y-4">
            <p className={tc.emptyStateText}>
              {pickLang(language, {
                tr: "Bu menüde henüz ürün yok.",
                en: "No items in this menu yet.",
                ru: "В этом меню пока нет позиций.",
                de: "In dieser Speisekarte gibt es noch keine Artikel.",
                fr: "Aucun article dans ce menu pour le moment.",
                es: "Aún no hay productos en este menú.",
                it: "Ancora nessun prodotto in questo menù.",
                uk: "У цьому меню поки немає позицій.",
                zh: "此菜单暂无菜品。",
                az: "Bu menyuda hələ məhsul yoxdur.",
              })}
            </p>
            {showMenuPicker && (
              <button type="button" onClick={backToMenuPick} className={tc.emptyStateLink}>
                {backToPickLabel}
              </button>
            )}
          </div>
        )}
        {activeCategoryServiceNote && (
          <p
            role="status"
            className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900"
          >
            {activeCategoryServiceNote}
          </p>
        )}
        {activeCategoryNote ? (
          <p className={`${tc.emptyStateText} whitespace-pre-line font-medium italic`}>
            {activeCategoryNote}
          </p>
        ) : null}
        {menuCategories.length > 0 && hasAnyTabProducts && (
          <MenuFilterBar
            value={menuFilter}
            onChange={setMenuFilter}
            options={filterOptions}
            theme={menuTheme}
            language={language}
            currency={{ rates: currencyRates, value: currencyRate, onChange: setCurrency }}
          />
        )}
        {hasAnyTabProducts && !hasAnyShownProducts && (
          <div className="text-center py-10 px-4 space-y-3">
            <p className={tc.emptyStateText}>
              {pickLang(language, {
                tr: "Bu kategoride filtrenize uyan ürün yok.",
                en: "No items in this category match your filters.",
                ru: "В этой категории нет блюд по выбранным фильтрам.",
                de: "Keine Artikel in dieser Kategorie entsprechen Ihren Filtern.",
                fr: "Aucun article de cette catégorie ne correspond à vos filtres.",
                es: "Ningún producto de esta categoría coincide con sus filtros.",
                it: "Nessun prodotto di questa categoria corrisponde ai filtri.",
                uk: "У цій категорії немає страв за вибраними фільтрами.",
                zh: "此分类中没有符合筛选条件的菜品。",
                az: "Bu kateqoriyada filtrinizə uyğun məhsul yoxdur.",
              })}
            </p>
            <button
              type="button"
              onClick={() => setMenuFilter({ ...EMPTY_MENU_FILTER, sort: menuFilter.sort })}
              className={tc.emptyStateLink}
            >
              {pickLang(language, {
                tr: "Filtreyi temizle",
                en: "Clear filters",
                ru: "Сбросить фильтры",
                de: "Filter zurücksetzen",
                fr: "Effacer les filtres",
                es: "Borrar filtros",
                it: "Cancella filtri",
                uk: "Скинути фільтри",
                zh: "清除筛选",
                az: "Filtri təmizlə",
              })}
            </button>
          </div>
        )}
        {shownProducts.map((product) => (
          <PublicProductCard
            key={product.id}
            product={product}
            theme={menuTheme}
            getText={getText}
            language={language}
            {...productServiceProps(product)}
          />
        ))}
        {shownSubsections.map((section) => {
          const note = getText(section.category, "note");
          // Yalnız alt kategorinin kendi zamanlaması; üst kategori/menü notu sayfanın üstündeki şeritte.
          const subServiceNote = serviceNote(
            resolveCategoryServiceWithParent(
              section.category,
              undefined,
              null,
              now
            ),
            language,
            now
          );
          return (
            <section key={section.category.id} className="space-y-3 pt-3" aria-label={getText(section.category, "name")}>
              <div className="space-y-1">
                <h2
                  className={`${tc.fontHeading} text-base font-black uppercase tracking-wide`}
                  style={{ color: themeColor }}
                >
                  {getText(section.category, "name")}
                </h2>
                {note ? (
                  <p className={`${tc.emptyStateText} whitespace-pre-line font-medium italic`}>{note}</p>
                ) : null}
                {subServiceNote ? (
                  <p
                    role="status"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"
                  >
                    {subServiceNote}
                  </p>
                ) : null}
              </div>
              {section.products.map((product) => (
                <PublicProductCard
                  key={product.id}
                  product={product}
                  theme={menuTheme}
                  getText={getText}
                  language={language}
                  {...productServiceProps(product)}
                />
              ))}
            </section>
          );
        })}
      </main>
      <PublicPriceDateNote
        products={products}
        show={restaurant.show_price_date}
        language={language}
        className={tc.emptyStateText}
      />
      <PublicVenueActions restaurant={restaurant} language={language} accentColor={themeColor} />
    </MenuThemeShell>
    </MenuCurrencyProvider>
    </ProductExtrasProvider>
  );
}
