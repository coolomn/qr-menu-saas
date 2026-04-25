"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from "swiper/modules";

import "swiper/css";
import "swiper/css/pagination";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function MenuPage() {
  const params = useParams();
  const slug = params.slug;

  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Hataları ekrana basmak için yeni bir alan ekledik:
  const [debugError, setDebugError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    async function fetchData() {
      try {
        // 1. Restoranı çekmeyi dene
        const { data: resData, error: resError } = await supabase
          .from("restaurants")
          .select("*")
          .eq("slug", slug)
          .single();

        // Eğer Supabase bir hata fırlatırsa bunu ekrana yazdıracağız
        if (resError) {
          console.error("Supabase Hatası:", resError);
          setDebugError(`Hata Kodu: ${resError.code} | Mesaj: ${resError.message}`);
          setLoading(false);
          return;
        }

        if (resData) {
          setRestaurant(resData);

          const { data: catData } = await supabase
            .from("categories")
            .select("*")
            .eq("restaurant_id", resData.id)
            .order("sort_order");
          if (catData) setCategories(catData);

          const { data: prodData } = await supabase
            .from("products")
            .select("*")
            .eq("is_active", true);
          if (prodData) setProducts(prodData);
        }
      } catch (err: any) {
        setDebugError(`Bağlantı Hatası: ${err.message}`);
      }
      setLoading(false);
    }

    fetchData();
  }, [slug]);

  if (loading) return <div className="flex justify-center items-center h-screen font-bold text-gray-500">Menü Yükleniyor...</div>;
  
  // EĞER BİR HATA VARSA ARTIK EKRANDA GÖRECEĞİZ
  if (debugError) return (
    <div className="p-8 m-4 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-red-600 font-bold text-xl mb-2">🚨 Bir Hata Yakalandı!</h2>
        <p className="text-red-800 font-mono">{debugError}</p>
        <p className="mt-4 text-sm text-gray-600">Lütfen bu hatayı bana gönder, sorunun kaynağını hemen söyleyeyim.</p>
    </div>
  );

  if (!restaurant) return <div className="flex justify-center items-center h-screen font-bold text-red-500">Restoran bulunamadı!</div>;

  return (
    <div className="max-w-md mx-auto bg-white min-h-screen shadow-lg pb-20" style={{ '--brand-color': restaurant.theme_color } as React.CSSProperties}>
      <header className="flex justify-center items-center p-4 bg-white sticky top-0 z-50 shadow-sm h-20">
        {restaurant.logo_url && <img src={restaurant.logo_url} alt={restaurant.name} className="h-full object-contain" />}
      </header>

      <section className="w-full h-48 bg-gray-200">
        <Swiper modules={[Pagination, Autoplay]} pagination={{ clickable: true }} autoplay={{ delay: 3000 }} loop={true} className="w-full h-full">
          <SwiperSlide><img src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80" className="w-full h-full object-cover" alt="Slide 1" /></SwiperSlide>
          <SwiperSlide><img src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80" className="w-full h-full object-cover" alt="Slide 2" /></SwiperSlide>
        </Swiper>
      </section>

      <nav className="bg-white border-b sticky top-20 z-40">
        <ul className="flex overflow-x-auto whitespace-nowrap p-3 gap-3 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {categories.map((cat, index) => (
            <li key={cat.id} className={`px-4 py-2 rounded-full text-sm font-semibold cursor-pointer border ${index === 0 ? 'bg-[var(--brand-color)] text-white border-[var(--brand-color)]' : 'bg-white text-gray-700 border-gray-200'}`}>
              {cat.name}
            </li>
          ))}
        </ul>
      </nav>

      <main className="p-4 flex flex-col gap-8">
        {categories.map(category => {
          const categoryProducts = products.filter(p => p.category_id === category.id);
          if (categoryProducts.length === 0) return null;
          return (
            <div key={category.id}>
              <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-2">{category.name}</h2>
              <div className="flex flex-col gap-4">
                {categoryProducts.map(product => (
                  <div key={product.id} className="flex bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                    {product.image_url && (
                      <div className="w-1/3"><img src={product.image_url} className="w-full h-32 object-cover" alt={product.name} /></div>
                    )}
                    <div className="w-2/3 p-3 flex flex-col justify-between">
                      <div>
                        <h3 className="font-bold text-gray-800 text-lg">{product.name}</h3>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                      </div>
                      <div className="font-bold mt-2 text-[var(--brand-color)]">{product.price}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}