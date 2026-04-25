"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { LogOut, UtensilsCrossed, QrCode, Plus, X, List, Power, PowerOff, Sparkles, Palette, Edit3, Info, ImageIcon } from "lucide-react";

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

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState("products");
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingSlider, setUploadingSlider] = useState(false);

  const [settings, setSettings] = useState({ 
    logo_url: "", 
    primary_color: "#2563eb",
    slider_images: [] as string[]
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  
  const [tableNumber, setTableNumber] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState({ name: "" });
  const [newProduct, setNewProduct] = useState({ 
    name: "", name_en: "", name_ru: "", 
    description: "", description_en: "", description_ru: "", 
    price: "", category_id: "", file: null as File | null, image_url: "",
    allergens: [] as string[]
  });

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/admin/login"); return; }
      setUser(session.user);
      const { data: resData } = await supabase.from("restaurants").select("*").eq("owner_id", session.user.id).single();
      if (resData) {
        setRestaurant(resData);
        setSettings({ 
            logo_url: resData.logo_url || "", 
            primary_color: resData.primary_color || "#2563eb",
            slider_images: resData.slider_images || []
        });
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id).order('sort_order');
        setCategories(catData || []);
        const { data: prodData } = await supabase.from("products").select("*, categories(name)").eq("categories.restaurant_id", resData.id);
        setProducts(prodData || []);
      }
      setLoading(false);
    };
    fetchData();
  }, [router]);

  // GÖRÜNÜM KAYDETME
  const handleSaveSettings = async () => {
    setIsSaving(true);
    let finalLogoUrl = settings.logo_url;

    if (logoFile) {
      const fileName = `logo-${Math.random()}.${logoFile.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('menu-images').upload(fileName, logoFile);
      if (!uploadError) finalLogoUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      else alert("Logo yüklenirken bir hata oluştu.");
    }

    const { error } = await supabase.from("restaurants").update({ 
        primary_color: settings.primary_color, 
        logo_url: finalLogoUrl,
        slider_images: settings.slider_images
    }).eq("id", restaurant.id);
    
    if (!error) {
        alert("Görünüm ayarları başarıyla kaydedildi!");
        setSettings({ ...settings, logo_url: finalLogoUrl });
        setLogoFile(null);
    }
    setIsSaving(false);
  };

  // SLIDER GÖRSELİ YÜKLEME (Anında Yüklenir)
  const handleSliderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // DOSYA BOYUTU KONTROLÜ (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert("Hata: Dosya boyutu 2MB'dan büyük olamaz! Lütfen daha küçük bir görsel seçin.");
      return;
    }

    setUploadingSlider(true);
    const fileName = `slider-${Math.random()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('menu-images').upload(fileName, file);

    if (!error) {
      const url = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      setSettings(prev => ({ ...prev, slider_images: [...prev.slider_images, url] }));
    } else {
      alert("Görsel yüklenirken bir hata oluştu.");
    }
    setUploadingSlider(false);
  };

  const removeSliderImage = (index: number) => {
    const newSliderImages = [...settings.slider_images];
    newSliderImages.splice(index, 1);
    setSettings({ ...settings, slider_images: newSliderImages });
  };

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    const { error } = await supabase.from("products").update({ is_active: !currentStatus }).eq("id", productId);
    if (!error) setProducts(products.map(p => p.id === productId ? { ...p, is_active: !currentStatus } : p));
  };

  const handleUpdatePrice = async (productId: string, currentPrice: string) => {
    const newPrice = window.prompt("Yeni fiyatı girin:", currentPrice);
    if (newPrice && newPrice !== currentPrice) {
      const { error } = await supabase.from("products").update({ price: newPrice }).eq("id", productId);
      if (!error) setProducts(products.map(p => p.id === productId ? { ...p, price: newPrice } : p));
    }
  };

  const toggleAllergen = (allergenId: string) => {
    setNewProduct(prev => {
      const current = prev.allergens || [];
      return current.includes(allergenId) 
        ? { ...prev, allergens: current.filter(id => id !== allergenId) }
        : { ...prev, allergens: [...current, allergenId] };
    });
  };

  const openEditModal = (product: any) => {
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name || "", name_en: product.name_en || "", name_ru: product.name_ru || "",
      description: product.description || "", description_en: product.description_en || "", description_ru: product.description_ru || "",
      price: product.price || "", category_id: product.category_id || "", file: null, image_url: product.image_url || "",
      allergens: product.allergens || []
    });
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    let imageUrl = newProduct.image_url;
    
    if (newProduct.file) {
      const fileName = `${Math.random()}.${newProduct.file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage.from('menu-images').upload(fileName, newProduct.file);
      if (!uploadError) imageUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
    }

    const payload = {
      category_id: newProduct.category_id, name: newProduct.name, name_en: newProduct.name_en, name_ru: newProduct.name_ru,
      description: newProduct.description, description_en: newProduct.description_en, description_ru: newProduct.description_ru,
      price: newProduct.price, image_url: imageUrl, allergens: newProduct.allergens
    };

    if (editingProductId) {
      const { data, error } = await supabase.from("products").update(payload).eq("id", editingProductId).select("*, categories(name)").single();
      if (!error) setProducts(products.map(p => p.id === editingProductId ? data : p));
    } else {
      const { data, error } = await supabase.from("products").insert([{ ...payload, is_active: true }]).select("*, categories(name)").single();
      if (!error) setProducts([...products, data]);
    }
    setIsProductModalOpen(false);
    setUploading(false);
    setEditingProductId(null);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from("categories").insert([{ restaurant_id: restaurant.id, name: newCategory.name, sort_order: categories.length }]).select().single();
    if (!error && data) {
      setCategories([...categories, data]);
      setNewCategory({ name: "" });
      setIsCategoryModalOpen(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!newProduct.name) return;
    setTranslating(true);
    try {
      const targets = [{t:'en', n:'name_en', d:'description_en'}, {t:'ru', n:'name_ru', d:'description_ru'}];
      const updated = { ...newProduct };
      for (const target of targets) {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newProduct.name)}&langpair=tr|${target.t}`);
        const data = await res.json();
        if (data.responseData) (updated as any)[target.n] = data.responseData.translatedText;
        if (newProduct.description) {
          const resD = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newProduct.description)}&langpair=tr|${target.t}`);
          const dataD = await resD.json();
          if (dataD.responseData) (updated as any)[target.d] = dataD.responseData.translatedText;
        }
      }
      setNewProduct(updated);
    } finally { setTranslating(false); }
  };

  const downloadQRCode = () => {
    const link = `https://tapmenu.com.tr/menu/${restaurant.slug}${tableNumber ? `?masa=${tableNumber}` : ""}`;
    window.open(`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(link)}`, '_blank');
  };

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-gray-400 italic">TapMenu Hazırlanıyor...</div>;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      <aside className="w-72 bg-white border-r flex flex-col shadow-sm">
        <div className="p-8 border-b flex items-center gap-3 font-bold text-2xl text-blue-600"><QrCode /> TapMenu</div>
        <nav className="flex-1 p-6 space-y-2">
          <button onClick={() => setActiveTab("products")} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'products' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><UtensilsCrossed size={20} /> Ürünler</button>
          <button onClick={() => setActiveTab("categories")} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'categories' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><List size={20} /> Kategoriler</button>
          <button onClick={() => setActiveTab("qr")} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'qr' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><QrCode size={20} /> QR Kod Üretici</button>
          <button onClick={() => setActiveTab("settings")} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><Palette size={20} /> Görünüm Ayarları</button>
        </nav>
        <div className="p-6 border-t"><button onClick={() => supabase.auth.signOut().then(() => router.push("/admin/login"))} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all"><LogOut size={20} /> Çıkış Yap</button></div>
      </aside>

      <main className="flex-1 overflow-y-auto p-12">
        <div className="max-w-5xl mx-auto">
          <header className="mb-12"><h1 className="text-4xl font-black text-gray-900 tracking-tight">{restaurant?.name}</h1><p className="text-gray-400 mt-2 font-medium">Panel Yönetimi</p></header>

          {activeTab === "products" && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b flex justify-between items-center bg-gray-50/50">
                <h2 className="text-xl font-black">Ürün Yönetimi</h2>
                <button onClick={() => { setEditingProductId(null); setNewProduct({name:"", name_en:"", name_ru:"", description:"", description_en:"", description_ru:"", price:"", category_id:"", file:null, image_url:"", allergens: []}); setIsProductModalOpen(true); }} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"><Plus size={20} /> Yeni Ürün Ekle</button>
              </div>
              <div className="p-4 grid gap-3">
                {products.map(p => (
                  <div key={p.id} className={`p-5 border border-gray-100 rounded-2xl flex justify-between items-center hover:border-blue-200 transition-all bg-white ${!p.is_active ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex items-center gap-4 flex-1 text-gray-900">
                      <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden border flex-shrink-0">{p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <UtensilsCrossed className="m-auto text-gray-300" />}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1"><div className="font-black text-lg leading-tight">{p.name}</div><div className="flex gap-1">{p.name_en && <span className="text-xs">🇬🇧</span>}{p.name_ru && <span className="text-xs">🇷🇺</span>}</div></div>
                        {p.description && <p className="text-xs text-gray-500 font-medium italic line-clamp-2">{p.description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                           <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block">{p.categories?.name}</span>
                           {p.allergens && p.allergens.length > 0 && (
                             <div className="flex gap-1">
                                {p.allergens.map((aId: string) => {
                                  const alg = ALLERGEN_OPTIONS.find(a => a.id === aId);
                                  return alg ? <span key={aId} title={alg.label} className="text-xs">{alg.icon}</span> : null;
                                })}
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <button onClick={() => openEditModal(p)} className="p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Düzenle"><Edit3 size={20} /></button>
                      <button onClick={() => handleToggleActive(p.id, p.is_active)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.is_active ? <Power size={14} /> : <PowerOff size={14} />} {p.is_active ? 'SATIŞTA' : 'TÜKENDİ'}</button>
                      <div className="text-right min-w-[80px]"><div className="text-xl font-black text-blue-600 leading-none">{p.price}</div><button onClick={() => handleUpdatePrice(p.id, p.price)} className="text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase mt-1">Fiyatı Düzenle</button></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "categories" && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
              <div className="flex justify-between mb-8"><h2 className="text-xl font-black text-gray-900 uppercase">Kategoriler</h2><button onClick={() => setIsCategoryModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-1 hover:bg-blue-700 shadow-lg transition-all"><Plus size={18}/> Yeni Kategori</button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{categories.map(c => <div key={c.id} className="p-4 bg-gray-50 rounded-2xl font-black text-gray-700 border border-gray-100">{c.name}</div>)}</div>
            </div>
          )}

          {activeTab === "qr" && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-12 max-w-md mx-auto text-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner"><QrCode size={40} /></div>
              <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tighter">QR Üretici</h2>
              <input type="text" placeholder="Masa No (Örn: 5)" className="w-full border-2 border-gray-100 p-5 rounded-2xl mb-6 text-center text-2xl font-black text-gray-900 focus:border-blue-500 outline-none transition-all" value={tableNumber} onChange={e => setTableNumber(e.target.value)} />
              <button onClick={downloadQRCode} className="w-full bg-gray-900 text-white py-5 rounded-2xl font-black shadow-xl hover:bg-black transition-all">QR Kodu Aç / İndir</button>
            </div>
          )}

          {/* GÖRÜNÜM AYARLARI */}
          {activeTab === "settings" && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 max-w-2xl mx-auto">
              <h2 className="text-2xl font-black mb-8 text-gray-900">Marka Kimliği</h2>
              <div className="space-y-8">
                
                {/* LOGO */}
                <div>
                  <label className="block text-xs font-black text-gray-400 mb-3 uppercase tracking-widest">Restoran Logosu</label>
                  {settings.logo_url && !logoFile && (
                    <div className="mb-4 bg-gray-50 p-4 rounded-2xl inline-block border-2 border-gray-100">
                       <img src={settings.logo_url} alt="Mevcut Logo" className="h-16 object-contain" />
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files ? e.target.files[0] : null)} className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 outline-none" />
                </div>

                {/* SLIDER ALANI */}
                <div className="p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon size={18} className="text-blue-500" />
                    <label className="text-sm font-black text-gray-900 uppercase">Vitrin (Slider) Görselleri</label>
                  </div>
                  <p className="text-xs font-bold text-gray-400 mb-4">Menünün en üstünde dönecek görseller. En fazla 3 adet, maksimum 2 MB. Yatay görseller (16:9) önerilir.</p>
                  
                  {/* Mevcut Slider Görselleri */}
                  {settings.slider_images.length > 0 && (
                    <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
                      {settings.slider_images.map((img, idx) => (
                        <div key={idx} className="relative w-32 h-20 bg-gray-200 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-200">
                          <img src={img} className="w-full h-full object-cover" />
                          <button onClick={() => removeSliderImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-lg hover:bg-red-600 transition-colors shadow-md">
                            <X size={12} strokeWidth={4} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Yeni Görsel Yükle (3'ten azsa göster) */}
                  {settings.slider_images.length < 3 && (
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleSliderUpload} 
                        disabled={uploadingSlider}
                        className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer disabled:opacity-50" 
                      />
                      {uploadingSlider && <div className="absolute top-3 left-40 text-xs font-black text-blue-600 animate-pulse">Yükleniyor...</div>}
                    </div>
                  )}
                  {settings.slider_images.length >= 3 && (
                     <div className="text-xs font-bold text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">Maksimum sınır olan 3 görsele ulaştınız. Yeni eklemek için eskilerden birini silin.</div>
                  )}
                </div>

                {/* MARKA RENGİ */}
                <div>
                  <label className="block text-xs font-black text-gray-400 mb-3 uppercase tracking-widest">Marka Rengi</label>
                  <div className="flex gap-4 p-4 bg-gray-50 rounded-2xl border-2 border-gray-50">
                    <input type="color" className="w-16 h-16 rounded-xl cursor-pointer border-0 p-0 bg-transparent" value={settings.primary_color} onChange={e => setSettings({...settings, primary_color: e.target.value})} />
                    <input type="text" className="flex-1 bg-transparent font-mono font-black text-xl text-gray-900 outline-none" value={settings.primary_color} onChange={e => setSettings({...settings, primary_color: e.target.value})} />
                  </div>
                </div>
                
                <button onClick={handleSaveSettings} disabled={isSaving} className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all">
                  {isSaving ? "KAYDEDİLİYOR..." : "AYARLARI KAYDET"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ÜRÜN MODALI VE KATEGORİ MODALI AYNEN KORUNMUŞTUR */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-8 border-b flex justify-between items-center">
                    <h3 className="font-black text-2xl text-gray-900 tracking-tighter">{editingProductId ? "Ürünü Düzenle" : "Yeni Ürün Ekle"}</h3>
                    <button type="button" onClick={() => {setIsProductModalOpen(false); setEditingProductId(null);}} className="text-gray-300 hover:text-gray-900"><X size={32} /></button>
                </div>
                <form onSubmit={handleProductSubmit} className="p-8 space-y-6 overflow-y-auto text-gray-900">
                    <div className="grid grid-cols-2 gap-4">
                        <select required className="border-2 border-gray-50 bg-gray-50 p-4 rounded-2xl font-bold outline-none focus:border-blue-500 text-gray-900" value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})}>
                            <option value="">Kategori Seç</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                        <input required type="text" placeholder="Fiyat (Örn: 250 ₺)" className="border-2 border-gray-50 bg-gray-50 p-4 rounded-2xl font-black outline-none focus:border-blue-500 text-gray-900" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
                    </div>

                    <div className="p-6 bg-blue-50 rounded-[2rem] border border-blue-100 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">🇹🇷 Türkçe Bilgiler</span>
                            <button type="button" onClick={handleAutoTranslate} disabled={translating} className="text-[10px] font-black bg-white text-blue-600 px-4 py-2 rounded-full shadow-sm flex items-center gap-2 hover:scale-105 transition-all">
                                <Sparkles size={12}/> {translating ? "ÇEVRİLİYOR..." : "OTOMATİK ÇEVİR"}
                            </button>
                        </div>
                        <input required placeholder="Ürün Adı" className="w-full bg-white p-4 rounded-xl font-black text-gray-900 outline-none shadow-sm" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                        <textarea placeholder="Açıklama..." className="w-full bg-white p-4 rounded-xl font-medium text-gray-600 text-sm outline-none shadow-sm" rows={2} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2">🇬🇧 English</label>
                            <input placeholder="Name" className="w-full border-2 border-gray-50 p-3 rounded-xl text-sm font-bold text-gray-900 outline-none" value={newProduct.name_en} onChange={e => setNewProduct({...newProduct, name_en: e.target.value})} />
                            <textarea placeholder="Description" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs font-medium text-gray-900 outline-none" rows={2} value={newProduct.description_en} onChange={e => setNewProduct({...newProduct, description_en: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase ml-2">🇷🇺 Russian</label>
                            <input placeholder="Название" className="w-full border-2 border-gray-50 p-3 rounded-xl text-sm font-bold text-gray-900 outline-none" value={newProduct.name_ru} onChange={e => setNewProduct({...newProduct, name_ru: e.target.value})} />
                            <textarea placeholder="Описание" className="w-full border-2 border-gray-50 p-3 rounded-xl text-xs font-medium text-gray-900 outline-none" rows={2} value={newProduct.description_ru} onChange={e => setNewProduct({...newProduct, description_ru: e.target.value})} />
                        </div>
                    </div>

                    <div className="p-5 border-2 border-gray-50 rounded-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Info size={16} className="text-gray-400" />
                            <label className="text-xs font-black text-gray-600 uppercase">Alerjenler & Beslenme Biçimi</label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {ALLERGEN_OPTIONS.map(alg => (
                                <button key={alg.id} type="button" onClick={() => toggleAllergen(alg.id)} className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${newProduct.allergens?.includes(alg.id) ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                    <span>{alg.icon}</span> {alg.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase ml-2">Ürün Görseli</label>
                        <input type="file" className="w-full text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" onChange={e => setNewProduct({...newProduct, file: e.target.files ? e.target.files[0] : null})} />
                    </div>

                    <button disabled={uploading} type="submit" className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black text-lg shadow-xl hover:bg-blue-700 transition-all uppercase">
                        {uploading ? "İŞLENİYOR..." : editingProductId ? "DEĞİŞİKLİKLERİ KAYDET" : "MENÜYE EKLE"}
                    </button>
                </form>
            </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-8 shadow-2xl">
                <h3 className="font-black text-xl mb-6 text-gray-900">Yeni Kategori</h3>
                <form onSubmit={handleAddCategory}>
                  <input required placeholder="Kategori Adı" className="w-full border-2 border-gray-50 bg-gray-50 p-4 rounded-2xl mb-6 font-black text-gray-900 outline-none" value={newCategory.name} onChange={e => setNewCategory({name: e.target.value})} />
                  <div className="flex gap-4"><button type="button" onClick={() => setIsCategoryModalOpen(false)} className="flex-1 font-bold text-gray-400">İptal</button><button type="submit" className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg">Ekle</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}