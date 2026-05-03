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
    if (language === "en" && item[`${field}_en`]) return item[`${field}_en`];
    if (language === "ru" && item[`${field}_ru`]) return item[`${field}_ru`];
    return item[field];
  };

  const groupedCategories = categories.reduce((acc, cat) => {
    const group = cat.main_group || "DİĞER";
    if (!acc[group]) acc[group] = [];
    acc[group].push(cat);
    return acc;
  }, {} as Record<string, any[]>);

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
                    <span>{groupName}</span>
                    {isExpanded ? <X size={24} strokeWidth={3} /> : <MenuIcon size={24} strokeWidth={3} />}
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                      {cats.map((cat: any) => (
                        <button 
                          key={cat.id}
                          onClick={() => {
                            setActiveCategory(cat.id);
                            setView("menu");
                          }}
                          className="w-full bg-[#E5DFD3] text-[#1F3B2B] py-4 rounded-lg font-bold text-base tracking-widest uppercase shadow-md active:scale-[0.98] transition-transform opacity-95"
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans selection:bg-gray-200">
      
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="p-4 flex items-center justify-between max-w-2xl mx-auto border-b border-gray-50">
          <button onClick={() => setView("welcome")} className="flex items-center gap-1 text-sm font-black text-gray-500 hover:text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
            <ChevronLeft size={16} /> KARŞILAMA
          </button>
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt="Restoran Logosu" className="h-8 object-contain" />
          ) : (
            <h1 style={{ color: themeColor }} className="text-xl font-black tracking-tighter uppercase">{restaurant.name}</h1>
          )}
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
          {categories.map((cat: any) => (
            <button 
              key={cat.id} onClick={() => setActiveCategory(cat.id)} style={activeCategory === cat.id ? { backgroundColor: themeColor, color: '#fff' } : {}}
              className={`whitespace-nowrap px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${activeCategory === cat.id ? 'shadow-md shadow-gray-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {cat.name}
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