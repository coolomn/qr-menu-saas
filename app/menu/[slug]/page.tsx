"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";
import { ChevronLeft, Menu as MenuIcon, X } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ALLERGEN_OPTIONS = [
  { id: 'gluten', label: 'Gluten', icon: '🌾' },
  { id: 'dairy', label: 'Süt', icon: '🥛' },
  { id: 'nuts', label: 'Kuruyemiş', icon: '🥜' },
  { id: 'seafood', label: 'Deniz Ürünü', icon: '🦐' },
  { id: 'egg', label: 'Yumurta', icon: '🥚' },
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'spicy', label: 'Acı', icon: '🌶️' }
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

/** Profil web URL’si + yalnızca tek kullanıcı profili için `instagram://` kullanıcı adı (reel/explore vb. için null). */
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
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [language, setLanguage] = useState("tr");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const [view, setView] = useState<"welcome" | "menu">("welcome");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  /** Menü şeridinde yalnızca bu ana gruptaki kategoriler (karşılamadan gelen seçim). */
  const [menuMainGroup, setMenuMainGroup] = useState<string | null>(null);

  useEffect(() => {
    const fetchMenu = async () => {
      const { data: resData } = await supabase.from("restaurants").select("*").eq("slug", slug).single();
      if (resData) {
        setRestaurant(resData);
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id).order('sort_order');
        setCategories(catData || []);
        
        if (catData && catData.length > 0) {
          const catIds = catData.map(c => c.id);
          const { data: prodData } = await supabase.from("products").select("*, categories!inner(restaurant_id)").in("category_id", catIds).eq("is_active", true);
          setProducts(prodData || []);
        }
      }
      setLoading(false);
    };
    fetchMenu();
  }, [slug]);

  useEffect(() => {
    if (view === "welcome" || !restaurant?.slider_images || restaurant.slider_images.length <= 1) return;
    const timer = setInterval(() => setCurrentSlide((prev) => (prev === restaurant.slider_images.length - 1 ? 0 : prev + 1)), 3000);
    return () => clearInterval(timer);
  }, [restaurant?.slider_images, view]);

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-gray-400">Menü Hazırlanıyor...</div>;
  if (!restaurant) return <div className="h-screen flex items-center justify-center font-bold text-red-500 text-xl">Restoran bulunamadı.</div>;

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

  /** Karşılama ana grup başlığı: gruptaki ilk kategoriden çok dilli main_group okunur. */
  const getGroupLabel = (groupKey: string, cats: any[]) => {
    const sample = cats[0];
    if (!sample) return groupKey;
    const trLabel = sample.main_group || groupKey;
    return getText({ ...sample, main_group: trLabel }, "main_group");
  };

  const groupedCategories = categories.reduce((acc, cat) => {
    const group = cat.main_group || "DİĞER";
    if (!acc[group]) acc[group] = [];
    acc[group].push(cat);
    return acc;
  }, {} as Record<string, any[]>);

  const categoryGroupKey = (cat: { main_group?: string | null }) => cat.main_group || "DİĞER";
  const menuCategories =
    menuMainGroup != null
      ? categories.filter((c: any) => categoryGroupKey(c) === menuMainGroup)
      : categories;

  const instagramCtx = instagramOpenContext(restaurant.instagram);

  if (view === "welcome") {
    return (
      <div 
        className="relative min-h-screen flex flex-col items-center justify-between bg-cover bg-center bg-no-repeat font-sans"
        style={{ backgroundImage: `url(${restaurant.welcome_bg_url || 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1934&auto=format&fit=crop'})` }}
      >
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />

        <div className="relative z-10 w-full p-6 flex justify-end">
            <div className="bg-white px-4 py-2 rounded-xl text-sm font-black text-gray-900 shadow-lg cursor-pointer flex gap-3">
              <span onClick={() => setLanguage("tr")} className={language === 'tr' ? 'text-black' : 'opacity-40 grayscale'}>TR</span>
              <span onClick={() => setLanguage("en")} className={language === 'en' ? 'text-black' : 'opacity-40 grayscale'}>EN</span>
              <span onClick={() => setLanguage("ru")} className={language === 'ru' ? 'text-black' : 'opacity-40 grayscale'}>RU</span>
            </div>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center w-full px-6">
           <div className="px-10 py-8 shadow-2xl backdrop-blur-sm flex items-center justify-center min-w-[200px]" style={{ backgroundColor: `${themeColor}E6` }}>
             {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt="Restoran Logosu" className="max-h-24 object-contain filter drop-shadow-md" />
             ) : (
                <h1 className="text-4xl font-black tracking-widest text-white">{restaurant.name}</h1>
             )}
           </div>
        </div>

        <div className="relative z-10 w-full max-w-md mx-auto px-6 pb-12 space-y-3">
            {(Object.entries(groupedCategories) as [string, any[]][]).map(([groupName, cats]) => {
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
                      {cats.map((cat: any) => (
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
            })}
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
    <div className="min-h-screen bg-gray-50 pb-24 font-sans selection:bg-gray-200">
      
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="p-4 flex items-center gap-2 max-w-2xl mx-auto border-b border-gray-50">
          <button type="button" aria-label="Karşılama ekranına dön" onClick={() => { setView("welcome"); setMenuMainGroup(null); }} className="flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-900 bg-gray-100 p-2 rounded-lg transition-colors">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <div className="flex-1 min-w-0 flex justify-center px-1">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt="Restoran Logosu" className="h-8 max-w-[40vw] sm:max-w-none object-contain" />
            ) : (
              <h1 style={{ color: themeColor }} className="text-base sm:text-xl font-black tracking-tighter uppercase truncate text-center max-w-[42vw] sm:max-w-md">{restaurant.name}</h1>
            )}
          </div>
          <div className="flex-shrink-0 bg-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-black text-gray-900 shadow-lg flex gap-2 sm:gap-3 border border-gray-100 cursor-pointer select-none">
            <span onClick={() => setLanguage("tr")} className={language === "tr" ? "text-black" : "opacity-40 grayscale"}>TR</span>
            <span onClick={() => setLanguage("en")} className={language === "en" ? "text-black" : "opacity-40 grayscale"}>EN</span>
            <span onClick={() => setLanguage("ru")} className={language === "ru" ? "text-black" : "opacity-40 grayscale"}>RU</span>
          </div>
        </div>

        {restaurant.slider_images && restaurant.slider_images.length > 0 && (
          <div className="w-full bg-white pb-3 pt-3">
             <div className="max-w-2xl mx-auto px-4">
                <div className="relative overflow-hidden rounded-2xl shadow-sm border border-gray-100 aspect-[16/9] bg-gray-900">
                  {restaurant.slider_images.map((img: string, idx: number) => {
                    const isActive = currentSlide === idx;
                    return (
                      <div key={idx} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                        <img src={img} alt={`Menü Görseli ${idx + 1}`} className={`w-full h-full object-cover transition-transform duration-[4000ms] ease-out ${isActive ? 'scale-110' : 'scale-100'}`} />
                      </div>
                    );
                  })}
                </div>
             </div>
          </div>
        )}

        <div className="flex overflow-x-auto gap-2 p-3 max-w-2xl mx-auto no-scrollbar scroll-smooth">
          {menuCategories.map((cat: any) => (
            <button 
              key={cat.id} onClick={() => setActiveCategory(cat.id)} style={activeCategory === cat.id ? { backgroundColor: themeColor, color: '#fff' } : {}}
              className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${activeCategory === cat.id ? 'shadow-md shadow-gray-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {getText(cat, "name")}
            </button>
          ))}
        </div>
      </header>

      <main className="p-3 max-w-2xl mx-auto space-y-3 mt-1">
        {products.filter((p: any) => p.category_id === activeCategory).map((product: any) => (
          <div key={product.id} className="bg-white p-3 md:p-4 rounded-3xl shadow-sm border border-gray-100 flex gap-3 md:gap-4 hover:border-gray-200 transition-colors">
            {product.image_url && (<div className="w-24 h-24 md:w-28 md:h-28 flex-shrink-0 bg-gray-100 rounded-2xl overflow-hidden shadow-inner relative"><img src={product.image_url} alt={product.name || 'Ürün Görseli'} className="w-full h-full object-cover" /></div>)}
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-start gap-2 mb-1"><h3 className="font-black text-gray-900 leading-tight text-base md:text-lg">{getText(product, 'name')}</h3><span style={{ color: themeColor }} className="font-black text-lg md:text-xl whitespace-nowrap">{product.price}</span></div>
              {getText(product, 'description') && (<p className="text-xs md:text-sm text-gray-500 font-medium leading-snug mb-2 line-clamp-2">{getText(product, 'description')}</p>)}
              {product.allergens && product.allergens.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-auto">
                  {product.allergens.map((aId: string) => {
                    const alg = ALLERGEN_OPTIONS.find((a: any) => a.id === aId);
                    return alg ? (<div key={aId} className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-lg"><span className="text-[10px]">{alg.icon}</span><span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">{alg.label}</span></div>) : null;
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