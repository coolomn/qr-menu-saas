"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

  useEffect(() => {
    const fetchMenu = async () => {
      const { data: resData } = await supabase.from("restaurants").select("*").eq("slug", slug).single();
      
      if (resData) {
        setRestaurant(resData);
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id).order('sort_order');
        setCategories(catData || []);
        if (catData && catData.length > 0) setActiveCategory(catData[0].id);

        const { data: prodData } = await supabase.from("products").select("*, categories!inner(restaurant_id)").eq("categories.restaurant_id", resData.id).eq("is_active", true);
        setProducts(prodData || []);
      }
      setLoading(false);
    };
    fetchMenu();
  }, [slug]);

  // 3 Saniyede Bir Otomatik Değişim
  useEffect(() => {
    if (!restaurant?.slider_images || restaurant.slider_images.length <= 1) return;
    
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev === restaurant.slider_images.length - 1 ? 0 : prev + 1));
    }, 3000);

    return () => clearInterval(timer);
  }, [restaurant?.slider_images]);

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-gray-400">Menü Hazırlanıyor...</div>;
  if (!restaurant) return <div className="h-screen flex items-center justify-center font-bold text-red-500 text-xl">Restoran bulunamadı.</div>;

  const themeColor = restaurant.primary_color || "#2563eb";

  const getText = (item: any, field: string) => {
    if (language === "en" && item[`${field}_en`]) return item[`${field}_en`];
    if (language === "ru" && item[`${field}_ru`]) return item[`${field}_ru`];
    return item[field];
  };

  const nextSlide = () => setCurrentSlide(prev => prev === restaurant.slider_images.length - 1 ? 0 : prev + 1);
  const prevSlide = () => setCurrentSlide(prev => prev === 0 ? restaurant.slider_images.length - 1 : prev - 1);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans selection:bg-gray-200">
      
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="p-5 flex items-center justify-between max-w-2xl mx-auto">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt="Logo" className="h-10 object-contain" />
          ) : (
            <h1 style={{ color: themeColor }} className="text-2xl font-black tracking-tighter uppercase">{restaurant.name}</h1>
          )}
          
          <div className="flex gap-3 bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
            <button onClick={() => setLanguage("tr")} className={`text-xl transition-all ${language === 'tr' ? 'scale-110 drop-shadow-md' : 'opacity-40 grayscale'}`}>🇹🇷</button>
            <button onClick={() => setLanguage("en")} className={`text-xl transition-all ${language === 'en' ? 'scale-110 drop-shadow-md' : 'opacity-40 grayscale'}`}>🇬🇧</button>
            <button onClick={() => setLanguage("ru")} className={`text-xl transition-all ${language === 'ru' ? 'scale-110 drop-shadow-md' : 'opacity-40 grayscale'}`}>🇷🇺</button>
          </div>
        </div>

        {/* SİNEMATİK SLIDER (Cross-Dissolve & Zoom-in) */}
        {restaurant.slider_images && restaurant.slider_images.length > 0 && (
          <div className="w-full bg-white pb-4">
             <div className="max-w-2xl mx-auto px-4">
                <div className="relative overflow-hidden rounded-3xl shadow-sm border border-gray-100 aspect-[16/9] bg-gray-900">
                  
                  {restaurant.slider_images.map((img: string, idx: number) => {
                    const isActive = currentSlide === idx;
                    return (
                      <div 
                        key={idx}
                        className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                      >
                        <img 
                          src={img} 
                          // Zoom efekti: Aktifken %110 büyür, pasifken %100'de durur. Çok yavaş bir geçiş (4 saniye) ekledik.
                          className={`w-full h-full object-cover transition-transform duration-[4000ms] ease-out ${isActive ? 'scale-110' : 'scale-100'}`} 
                          alt={`Slider ${idx}`} 
                        />
                      </div>
                    );
                  })}

                  {/* OKLAR VE NOKTALAR (z-20 ile fotoğrafların üstünde tutuyoruz) */}
                  {restaurant.slider_images.length > 1 && (
                    <div className="absolute inset-0 z-20 pointer-events-none">
                      {/* Sol Ok */}
                      <button onClick={prevSlide} className="pointer-events-auto absolute left-3 top-1/2 -translate-y-1/2 bg-black/30 text-white p-2 rounded-full backdrop-blur-md active:scale-95 hover:bg-black/50 transition-all">
                        <ChevronLeft size={20} />
                      </button>
                      
                      {/* Sağ Ok */}
                      <button onClick={nextSlide} className="pointer-events-auto absolute right-3 top-1/2 -translate-y-1/2 bg-black/30 text-white p-2 rounded-full backdrop-blur-md active:scale-95 hover:bg-black/50 transition-all">
                        <ChevronRight size={20} />
                      </button>

                      {/* İlerleme Noktaları */}
                      <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {restaurant.slider_images.map((_: any, idx: number) => (
                          <button 
                            key={idx} 
                            onClick={() => setCurrentSlide(idx)} 
                            className={`h-2 rounded-full transition-all duration-500 ${currentSlide === idx ? 'bg-white w-6 shadow-md' : 'bg-white/50 w-2 hover:bg-white/80'}`} 
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
             </div>
          </div>
        )}

        <div className="flex overflow-x-auto gap-3 p-4 max-w-2xl mx-auto no-scrollbar scroll-smooth">
          {categories.map(cat => (
            <button 
              key={cat.id} 
              onClick={() => setActiveCategory(cat.id)}
              style={activeCategory === cat.id ? { backgroundColor: themeColor, color: '#fff' } : {}}
              className={`whitespace-nowrap px-6 py-3 rounded-2xl font-black text-sm transition-all ${activeCategory === cat.id ? 'shadow-lg shadow-gray-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-4 mt-2">
        {products.filter(p => p.category_id === activeCategory).map(product => (
          <div key={product.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex gap-4 hover:border-gray-200 transition-colors">
            
            {product.image_url && (
              <div className="w-28 h-28 flex-shrink-0 bg-gray-100 rounded-2xl overflow-hidden shadow-inner relative">
                <img src={product.image_url} className="w-full h-full object-cover" />
              </div>
            )}
            
            <div className="flex-1 flex flex-col justify-center">
              <div className="flex justify-between items-start gap-2 mb-1">
                <h3 className="font-black text-gray-900 leading-tight text-lg">{getText(product, 'name')}</h3>
                <span style={{ color: themeColor }} className="font-black text-xl whitespace-nowrap">{product.price}</span>
              </div>
              
              {getText(product, 'description') && (
                <p className="text-sm text-gray-500 font-medium leading-snug mb-3 line-clamp-2">{getText(product, 'description')}</p>
              )}

              {product.allergens && product.allergens.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {product.allergens.map((aId: string) => {
                    const alg = ALLERGEN_OPTIONS.find(a => a.id === aId);
                    return alg ? (
                      <div key={aId} className="flex items-center gap-1 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                        <span className="text-[12px]">{alg.icon}</span>
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{alg.label}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {products.filter(p => p.category_id === activeCategory).length === 0 && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🍽️</div>
            <div className="text-gray-400 font-bold">Bu kategoride henüz ürün yok.</div>
          </div>
        )}
      </main>
    </div>
  );
}