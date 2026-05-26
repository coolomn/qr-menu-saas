"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Menu as MenuIcon, UtensilsCrossed, X } from "lucide-react";
import { MenuPickScreen } from "@/app/menu/[slug]/_components/menu-pick-screen";
import { formatPriceForDisplay } from "@/lib/format-price";
import { categoryBelongsToMenuCollection } from "@/lib/public-menu/display";
import type { PublicMenuCollection, PublicMenuPicker } from "@/lib/public-menu/menu-collections";
import { MULTI_MENU_PROTOTYPE_ENABLED } from "@/lib/menu-prototype/config";

const ALLERGEN_OPTIONS = [
  { id: "gluten", label: "Gluten", icon: "🌾" },
  { id: "dairy", label: "Süt", icon: "🥛" },
  { id: "nuts", label: "Kuruyemiş", icon: "🥜" },
  { id: "seafood", label: "Deniz Ürünü", icon: "🦐" },
  { id: "egg", label: "Yumurta", icon: "🥚" },
  { id: "vegan", label: "Vegan", icon: "🌱" },
  { id: "spicy", label: "Acı", icon: "🌶️" },
];

/** DB’de çeviri yokken EN/RU için bilinen Türkçe ana grup / kategori adları (genişletilebilir). */
const MENU_LABEL_FALLBACK: Record<string, { en: string; ru: string }> = {
  YİYECEKLER: { en: "Foods", ru: "Блюда" },
  İÇECEKLER: { en: "Drinks", ru: "Напитки" },
  DİĞER: { en: "Other", ru: "Другое" },
  KAHVE: { en: "Coffee", ru: "Кофе" },
  "ALKOLLÜ İÇECEKLER": { en: "Alcoholic drinks", ru: "Алкогольные напитки" },
  "ALKOLSÜZ İÇECEKLER": { en: "Non-alcoholic drinks", ru: "Безалкогольные напитки" },
  KAHVALTI: { en: "Breakfast", ru: "Завтрак" },
  BURGER: { en: "Burgers", ru: "Бургеры" },
  PİZZA: { en: "Pizza", ru: "Пицца" },
  PIZZA: { en: "Pizza", ru: "Пицца" },
  TATLILAR: { en: "Desserts", ru: "Десерты" },
  MEZE: { en: "Meze", ru: "Мезе" },
  MEZELER: { en: "Cold starters", ru: "Закуски" },
  ÇORBA: { en: "Soups", ru: "Супы" },
  SALATA: { en: "Salads", ru: "Салаты" },
  "ANA YEMEK": { en: "Main courses", ru: "Основные блюда" },
  "ARA SICAK": { en: "Hot appetizers", ru: "Горячие закуски" },
  "SOĞUK İÇECEKLER": { en: "Cold drinks", ru: "Холодные напитки" },
  "SICAK İÇECEKLER": { en: "Hot drinks", ru: "Горячие напитки" },
  MAKARNALAR: { en: "Pasta", ru: "Паста" },
  BALIK: { en: "Fish", ru: "Рыба" },
  DENİZ: { en: "Seafood", ru: "Морепродукты" },
  "DENİZ ÜRÜNLERİ": { en: "Seafood", ru: "Морепродукты" },
  TAVUK: { en: "Chicken", ru: "Курица" },
  KUZU: { en: "Lamb", ru: "Баранина" },
  DANA: { en: "Beef", ru: "Говядина" },
  "VEJETARYEN MENÜ": { en: "Vegetarian", ru: "Вегетарианское меню" },
  VEGAN: { en: "Vegan", ru: "Веган" },
  ÇOCUK: { en: "Kids", ru: "Детское" },
  "ÇOCUK MENÜSÜ": { en: "Kids menu", ru: "Детское меню" },
};

type PublicCategory = {
  id: string;
  name: string;
  name_en?: string | null;
  name_ru?: string | null;
  main_group?: string | null;
  main_group_en?: string | null;
  main_group_ru?: string | null;
  sort_order?: number | null;
  menu_collection_ids?: string[];
};

function normalizeMenuLabelKey(s: string) {
  return s.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim();
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
  const slug = params.slug;

  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [menuCollections, setMenuCollections] = useState<PublicMenuCollection[]>([]);
  const [menuPicker, setMenuPicker] = useState<PublicMenuPicker | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuUnavailable, setMenuUnavailable] = useState(false);

  const [language, setLanguage] = useState("tr");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const [view, setView] = useState<"welcome" | "menu">("welcome");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [menuMainGroup, setMenuMainGroup] = useState<string | null>(null);
  const [selectedMenuCollectionId, setSelectedMenuCollectionId] = useState<string | null>(null);
  const [menuViewEntered, setMenuViewEntered] = useState(false);

  const useCollectionFlow = MULTI_MENU_PROTOTYPE_ENABLED;
  const showMenuPicker = useCollectionFlow && Boolean(menuPicker?.enabled);

  useEffect(() => {
    const fetchMenu = async () => {
      const slugValue = Array.isArray(slug) ? slug[0] : slug;
      if (!slugValue) {
        setLoading(false);
        return;
      }

      try {
        setMenuUnavailable(false);
        const response = await fetch(`/api/public-menu/${encodeURIComponent(slugValue)}`);

        if (response.status === 403) {
          setMenuUnavailable(true);
          setRestaurant(null);
          setCategories([]);
          setProducts([]);
          setMenuCollections([]);
          setMenuPicker(null);
          return;
        }

        if (!response.ok) {
          setMenuUnavailable(false);
          setRestaurant(null);
          setCategories([]);
          setProducts([]);
          setMenuCollections([]);
          setMenuPicker(null);
          return;
        }

        const data = (await response.json()) as {
          restaurant: any;
          categories: PublicCategory[];
          products: any[];
          menu_collections?: PublicMenuCollection[];
          menu_picker?: PublicMenuPicker;
        };

        const picker: PublicMenuPicker = data.menu_picker ?? {
          enabled: false,
          default_menu_collection_id: null,
        };
        const collections = data.menu_collections ?? [];

        setMenuUnavailable(false);
        setRestaurant(data.restaurant || null);
        setCategories(data.categories || []);
        setProducts(data.products || []);
        setMenuCollections(collections);
        setMenuPicker(picker);

        if (useCollectionFlow) {
          if (picker.enabled) {
            setView("welcome");
            setSelectedMenuCollectionId(null);
          } else {
            setView("menu");
            setSelectedMenuCollectionId(picker.default_menu_collection_id);
          }
        } else {
          setView("welcome");
          setSelectedMenuCollectionId(null);
        }
      } catch (error) {
        console.error(error);
        setMenuUnavailable(false);
        setRestaurant(null);
        setCategories([]);
        setProducts([]);
        setMenuCollections([]);
        setMenuPicker(null);
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();
  }, [slug, useCollectionFlow]);

  useEffect(() => {
    if (view !== "menu" || !restaurant?.slider_images || restaurant.slider_images.length <= 1) return;
    const timer = setInterval(
      () => setCurrentSlide((prev) => (prev === restaurant.slider_images.length - 1 ? 0 : prev + 1)),
      3000
    );
    return () => clearInterval(timer);
  }, [restaurant?.slider_images, view]);

  const categoryGroupKey = (cat: { main_group?: string | null }) => cat.main_group || "DİĞER";

  const menuCategories = useMemo(() => {
    let list = categories;
    if (menuMainGroup != null) {
      list = list.filter((c) => categoryGroupKey(c) === menuMainGroup);
    }
    if (useCollectionFlow && selectedMenuCollectionId) {
      list = list.filter((c) => categoryBelongsToMenuCollection(c, selectedMenuCollectionId));
    }
    return list;
  }, [categories, menuMainGroup, useCollectionFlow, selectedMenuCollectionId]);

  const menuCategoryIds = useMemo(
    () => new Set(menuCategories.map((c) => c.id)),
    [menuCategories]
  );

  const visibleProducts = useMemo(() => {
    return products.filter(
      (p: { category_id: string }) =>
        menuCategoryIds.has(p.category_id) && p.category_id === activeCategory
    );
  }, [products, activeCategory, menuCategoryIds]);

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
    setSelectedMenuCollectionId(menuCollectionId);
    setMenuMainGroup(null);
    setView("menu");
  };

  const backToMenuPick = () => {
    setView("welcome");
    setMenuMainGroup(null);
    setSelectedMenuCollectionId(null);
  };

  if (loading) return <MenuLoadingScreen />;
  if (menuUnavailable) return <MenuUnavailableScreen />;
  if (!restaurant) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F5F1EB] px-6 text-center font-bold text-[#1F3B2B] text-lg">
        Restoran bulunamadı.
      </div>
    );
  }

  const themeColor = restaurant.primary_color || "#2563eb";
  const getText = (item: any, field: string) => {
    const pick = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const en = pick(item[`${field}_en`]);
    const ru = pick(item[`${field}_ru`]);
    if (language === "en" && en) return en;
    if (language === "ru" && ru) return ru;
    const base = item[field];
    if (
      typeof base === "string" &&
      language !== "tr" &&
      (field === "name" || field === "main_group")
    ) {
      const fb = MENU_LABEL_FALLBACK[normalizeMenuLabelKey(base)];
      if (fb && language === "en") return fb.en;
      if (fb && language === "ru") return fb.ru;
    }
    return base;
  };

  const getGroupLabel = (groupKey: string, cats: PublicCategory[]) => {
    const sample = cats[0];
    if (!sample) return groupKey;
    const trLabel = sample.main_group || groupKey;
    return getText({ ...sample, main_group: trLabel }, "main_group");
  };

  const groupedCategories = categories.reduce(
    (acc, cat) => {
      const group = cat.main_group || "DİĞER";
      if (!acc[group]) acc[group] = [];
      acc[group].push(cat);
      return acc;
    },
    {} as Record<string, PublicCategory[]>
  );

  const instagramCtx = instagramOpenContext(restaurant.instagram);

  if (view === "welcome" && useCollectionFlow && showMenuPicker) {
    const instagramFollowLabel =
      language === "en"
        ? "Follow us"
        : language === "ru"
          ? "Подпишитесь"
          : "Takip edin";

    return (
      <MenuPickScreen
        restaurantName={restaurant.name}
        logoUrl={restaurant.logo_url}
        welcomeBgUrl={restaurant.welcome_bg_url}
        themeColor={themeColor}
        language={language}
        onLanguageChange={setLanguage}
        menuCollections={menuCollections}
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
    );
  }

  if (view === "welcome" && !useCollectionFlow) {
    return (
      <div
        className="relative min-h-screen flex flex-col items-center justify-between bg-cover bg-center bg-no-repeat font-sans"
        style={{
          backgroundImage: `url(${restaurant.welcome_bg_url || "https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934&auto=format&fit=crop"})`,
        }}
      >
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />

        <div className="relative z-10 w-full p-6 flex justify-end">
          <div className="bg-white px-4 py-2 rounded-xl text-sm font-black text-gray-900 shadow-lg cursor-pointer flex gap-3">
            <span
              onClick={() => setLanguage("tr")}
              className={language === "tr" ? "text-black" : "opacity-40 grayscale"}
            >
              TR
            </span>
            <span
              onClick={() => setLanguage("en")}
              className={language === "en" ? "text-black" : "opacity-40 grayscale"}
            >
              EN
            </span>
            <span
              onClick={() => setLanguage("ru")}
              className={language === "ru" ? "text-black" : "opacity-40 grayscale"}
            >
              RU
            </span>
          </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full px-6">
          <div
            className="px-10 py-8 shadow-2xl backdrop-blur-sm flex items-center justify-center min-w-[200px]"
            style={{ backgroundColor: `${themeColor}E6` }}
          >
            {restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt="Restoran Logosu"
                className="max-h-24 object-contain filter drop-shadow-md"
              />
            ) : (
              <h1 className="text-4xl font-black tracking-widest text-white">{restaurant.name}</h1>
            )}
          </div>
        </div>

        <div className="relative z-10 w-full max-w-md mx-auto px-6 pb-12 space-y-3">
          {(Object.entries(groupedCategories) as [string, PublicCategory[]][]).map(
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
                          onClick={() => {
                            setActiveCategory(cat.id);
                            setMenuMainGroup(groupName);
                            setView("menu");
                          }}
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
          )}
          {instagramCtx && (
            <footer className="pt-8 mt-2 border-t border-white/25 text-center">
              <p className="mb-3 text-[11px] sm:text-xs font-black uppercase tracking-[0.22em] text-white/95 drop-shadow-sm">
                {language === "en"
                  ? "Follow us now"
                  : language === "ru"
                    ? "Подпишитесь на нас"
                    : "Şimdi Takip Edin"}
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

  return (
    <div
      className={`min-h-screen bg-gray-50 pb-24 font-sans selection:bg-gray-200 transition-opacity duration-500 ${
        menuViewEntered ? "opacity-100" : "opacity-0"
      }`}
    >
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="p-4 flex items-center gap-2 max-w-2xl mx-auto border-b border-gray-50">
          {showMenuPicker ? (
            <button
              type="button"
              aria-label="Menü seçimine dön"
              onClick={backToMenuPick}
              className="flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-900 bg-gray-100 p-2 rounded-lg transition-colors"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
          ) : (
            <div className="w-9 flex-shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0 flex justify-center px-1">
            {restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt="Restoran Logosu"
                className="h-8 max-w-[40vw] sm:max-w-none object-contain"
              />
            ) : (
              <h1
                style={{ color: themeColor }}
                className="text-base sm:text-xl font-black tracking-tighter uppercase truncate text-center max-w-[42vw] sm:max-w-md"
              >
                {restaurant.name}
              </h1>
            )}
          </div>
          <div className="flex-shrink-0 bg-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black text-gray-900 shadow-lg flex gap-2 sm:gap-3 border border-gray-100 cursor-pointer select-none">
            <span onClick={() => setLanguage("tr")} className={language === "tr" ? "text-black" : "opacity-40 grayscale"}>
              TR
            </span>
            <span onClick={() => setLanguage("en")} className={language === "en" ? "text-black" : "opacity-40 grayscale"}>
              EN
            </span>
            <span onClick={() => setLanguage("ru")} className={language === "ru" ? "text-black" : "opacity-40 grayscale"}>
              RU
            </span>
          </div>
        </div>

        {restaurant.slider_images && restaurant.slider_images.length > 0 && (
          <div className="w-full bg-white pb-3 pt-3">
            <div className="max-w-2xl mx-auto px-4">
              <div className="relative overflow-hidden rounded-2xl shadow-sm border border-gray-100 aspect-[16/9] bg-gray-900">
                {restaurant.slider_images.map((img: string, idx: number) => {
                  const isActive = currentSlide === idx;
                  return (
                    <div
                      key={idx}
                      className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${isActive ? "opacity-100 z-10" : "opacity-0 z-0"}`}
                    >
                      <img
                        src={img}
                        alt={`Menü Görseli ${idx + 1}`}
                        className={`w-full h-full object-cover transition-transform duration-[4000ms] ease-out ${isActive ? "scale-110" : "scale-100"}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {menuCategories.length > 0 && (
          <div className="flex overflow-x-auto gap-2 p-3 max-w-2xl mx-auto no-scrollbar scroll-smooth">
            {menuCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={activeCategory === cat.id ? { backgroundColor: themeColor, color: "#fff" } : {}}
                className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${activeCategory === cat.id ? "shadow-md shadow-gray-200" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                {getText(cat, "name")}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="p-3 max-w-2xl mx-auto space-y-3 mt-1">
        {menuCategories.length === 0 && showMenuPicker && (
          <div className="text-center py-12 px-4 space-y-4">
            <p className="text-sm font-bold text-gray-500">
              {language === "en"
                ? "No categories in this menu yet."
                : language === "ru"
                  ? "В этом меню пока нет категорий."
                  : "Bu menüde henüz kategori yok."}
            </p>
            <button
              type="button"
              onClick={backToMenuPick}
              className="text-sm font-black uppercase tracking-wide text-gray-800 underline underline-offset-4"
            >
              {language === "en"
                ? "Back to menu selection"
                : language === "ru"
                  ? "К выбору меню"
                  : "Menü seçimine dön"}
            </button>
          </div>
        )}
        {visibleProducts.map((product: any) => (
          <div
            key={product.id}
            className="bg-white p-3 md:p-4 rounded-3xl shadow-sm border border-gray-100 flex gap-3 md:gap-4 hover:border-gray-200 transition-colors"
          >
            {product.image_url && (
              <div className="w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-gray-100 rounded-2xl overflow-hidden shadow-inner relative">
                <img
                  src={product.image_url}
                  alt={product.name || "Ürün Görseli"}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-start gap-2 mb-1">
                <h3 className="font-black text-gray-900 leading-tight text-base md:text-lg">
                  {getText(product, "name")}
                </h3>
                <span style={{ color: themeColor }} className="font-black text-lg md:text-xl whitespace-nowrap">
                  {formatPriceForDisplay(product.price)}
                </span>
              </div>
              {getText(product, "description") && (
                <p className="text-xs md:text-sm text-gray-500 font-medium leading-snug mb-2 line-clamp-2">
                  {getText(product, "description")}
                </p>
              )}
              {product.allergens && product.allergens.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                  {product.allergens.map((aId: string) => {
                    const alg = ALLERGEN_OPTIONS.find((a: any) => a.id === aId);
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
        ))}
      </main>
    </div>
  );
}
