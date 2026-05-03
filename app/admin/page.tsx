"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { LogOut, UtensilsCrossed, QrCode, Plus, X, List, Power, PowerOff, Sparkles, Palette, Edit3, Info, ImageIcon, Menu, Image as ImageIcon2, Trash2 } from "lucide-react";

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [settings, setSettings] = useState({ 
    logo_url: "", 
    primary_color: "#2563eb",
    slider_images: [] as string[],
    welcome_bg_url: ""
  });
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [welcomeBgFile, setWelcomeBgFile] = useState<File | null>(null);
  
  const [tableNumber, setTableNumber] = useState("");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Ana grubu başlangıçta boş bırakıyoruz
  const [newCategory, setNewCategory] = useState({ name: "", main_group: "" });
  
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
            slider_images: resData.slider_images || [],
            welcome_bg_url: resData.welcome_bg_url || ""
        });
        
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id).order('sort_order');
        setCategories(catData || []);
        
        if (catData && catData.length > 0) {
          const categoryIds = catData.map((c: any) => c.id);
          const { data: prodData } = await supabase.from("products").select("*, categories(name, main_group)").in("category_id", categoryIds);
          setProducts(prodData || []);
        } else {
          setProducts([]);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [router]);

  const handleSaveSettings = async () => {
    if (!restaurant) {
      alert("Hata: Restoran bulunamadı!"); return;
    }
    setIsSaving(true);
    try {
      let finalLogoUrl = settings.logo_url;
      let finalWelcomeBgUrl = settings.welcome_bg_url;

      if (logoFile) {
        const fileName = `logo-${Math.random()}.${logoFile.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('menu-images').upload(fileName, logoFile);
        if (!error) finalLogoUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      }

      if (welcomeBgFile) {
        const fileName = `bg-${Math.random()}.${welcomeBgFile.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('menu-images').upload(fileName, welcomeBgFile);
        if (!error) finalWelcomeBgUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      }

      const { error: dbError } = await supabase.from("restaurants").update({ 
          primary_color: settings.primary_color, 
          logo_url: finalLogoUrl,
          slider_images: settings.slider_images,
          welcome_bg_url: finalWelcomeBgUrl
      }).eq("id", restaurant.id);
      
      if (dbError) throw new Error(dbError.message);

      alert("Görünüm ayarları kaydedildi!");
      setSettings({ ...settings, logo_url: finalLogoUrl, welcome_bg_url: finalWelcomeBgUrl });
      setLogoFile(null);
      setWelcomeBgFile(null);
    } catch (error: any) {
      alert(error.message || "Hata oluştu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSliderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Maksimum 2MB!"); return; }
    setUploadingSlider(true);
    const fileName = `slider-${Math.random()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('menu-images').upload(fileName, file);
    if (!error) {
      const url = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
      setSettings(prev => ({ ...prev, slider_images: [...prev.slider_images, url] }));
    }
    setUploadingSlider(false);
  };

  const removeSliderImage = (index: number) => {
    const newSliderImages = [...settings.slider_images];
    newSliderImages.splice(index, 1);
    setSettings({ ...settings, slider_images: newSliderImages });
  };

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    await supabase.from("products").update({ is_active: !currentStatus }).eq("id", productId);
    setProducts(products.map((p: any) => p.id === productId ? { ...p, is_active: !currentStatus } : p));
  };

  const handleUpdatePrice = async (productId: string, currentPrice: string) => {
    const newPrice = window.prompt("Yeni fiyatı girin:", currentPrice);
    if (newPrice && newPrice !== currentPrice) {
      await supabase.from("products").update({ price: newPrice }).eq("id", productId);
      setProducts(products.map((p: any) => p.id === productId ? { ...p, price: newPrice } : p));
    }
  };

  const toggleAllergen = (allergenId: string) => {
    setNewProduct((prev: any) => {
      const current = prev.allergens || [];
      return current.includes(allergenId) 
        ? { ...prev, allergens: current.filter((id: string) => id !== allergenId) }
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
      const { data, error } = await supabase.from("products").update(payload).eq("id", editingProductId).select("*, categories(name, main_group)").single();
      if (!error) setProducts(products.map((p: any) => p.id === editingProductId ? data : p));
    } else {
      const { data, error } = await supabase.from("products").insert([{ ...payload, is_active: true }]).select("*, categories(name, main_group)").single();
      if (!error) setProducts([...products, data]);
    }
    setIsProductModalOpen(false);
    setUploading(false);
    setEditingProductId(null);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from("categories").insert([{ 
        restaurant_id: restaurant.id, 
        name: newCategory.name, 
        main_group: newCategory.main_group || "DİĞER", // Boş bırakılırsa DİĞER atanır
        sort_order: categories.length 
    }]).select().single();
    
    if (!error && data) {
      setCategories([...categories, data]);
      setNewCategory({ name: "", main_group: "" });
      setIsCategoryModalOpen(false);
    }
  };

  // YENİ: Kategori Silme Fonksiyonu
  const handleDeleteCategory = async (id: string, name: string) => {
    if (window.confirm(`"${name}" kategorisini tamamen silmek istediğinize emin misiniz?`)) {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (!error) {
        setCategories(categories.filter((c: any) => c.id !== id));
        // Kategori silindiğinde o kategoriye ait ürünleri de listeden temizleyelim (görsel olarak)
        setProducts(products.filter((p: any) => p.category_id !== id));
      } else {
        alert("Kategori silinirken bir hata oluştu.");
      }
    }
  };

  const handleAutoTranslate = async () => {
    if (!newProduct.name) return;
    setTranslating(true);
    try {
      const targets = [{t:'en', n:'name_en', d:'description_en'}, {t:'ru', n:'name_ru', d:'description_ru'}];
      const updated: any = { ...newProduct };
      for (const target of targets) {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newProduct.name)}&langpair=tr|${target.t}`);
        const data = await res.json();
        if (data.responseData) updated[target.n] = data.responseData.translatedText;
        if (newProduct.description) {
          const resD = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(newProduct.description)}&langpair=tr|${target.t}`);
          const dataD = await resD.json();
          if (dataD.responseData) updated[target.d] = dataD.responseData.translatedText;
        }
      }
      setNewProduct(updated);
    } finally { setTranslating(false); }
  };

  const downloadQRCode = () => { window.open(`https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(`https://tapmenu.com.tr/menu/${restaurant.slug}${tableNumber ? `?masa=${tableNumber}` : ""}`)}`, '_blank'); };

  if (loading) return <div className="h-screen flex items-center justify-center font-bold text-gray-400 italic">TapMenu Hazırlanıyor...</div>;

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r flex flex-col shadow-xl transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 border-b flex items-center justify-between"><div className="flex items-center gap-3 font-bold text-2xl text-blue-600"><QrCode /> TapMenu</div><button className="md:hidden text-gray-400" onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button></div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
          <button onClick={() => {setActiveTab("products"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'products' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><UtensilsCrossed size={20} /> Ürünler</button>
          <button onClick={() => {setActiveTab("categories"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'categories' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><List size={20} /> Kategoriler</button>
          <button onClick={() => {setActiveTab("qr"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'qr' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><QrCode size={20} /> QR Kod Üretici</button>
          <button onClick={() => {setActiveTab("settings"); setIsMobileMenuOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'text-gray-500 hover:bg-gray-50'}`}><Palette size={20} /> Görünüm Ayarları</button>
        </nav>
        <div className="p-6 border-t"><button onClick={() => supabase.auth.signOut().then(() => router.push("/admin/login"))} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 font-bold hover:bg-red-50 rounded-xl transition-all"><LogOut size={20} /> Çıkış Yap</button></div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="md:hidden bg-white p-4 border-b flex justify-between items-center shadow-sm z-20"><div className="font-bold text-xl text-blue-600 flex items-center gap-2"><QrCode size={24} /> TapMenu</div><button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-gray-900 bg-gray-50 rounded-xl"><Menu size={24} /></button></header>
        <main className="flex-1 overflow-y-auto p-4 md:p-12 w-full">
          <div className="max-w-5xl mx-auto">
            <header className="mb-6 md:mb-12"><h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tight">{restaurant?.name}</h1><p className="text-gray-400 mt-1 md:mt-2 font-medium text-sm md:text-base">Panel Yönetimi</p></header>

            {activeTab === "products" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 md:p-8 border-b flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50/50">
                  <h2 className="text-lg md:text-xl font-black">Ürün Yönetimi</h2>
                  <button onClick={() => { setEditingProductId(null); setNewProduct({name:"", name_en:"", name_ru:"", description:"", description_en:"", description_ru:"", price:"", category_id:"", file:null, image_url:"", allergens: []}); setIsProductModalOpen(true); }} className="w-full md:w-auto justify-center bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"><Plus size={20} /> Yeni Ürün</button>
                </div>
                <div className="p-3 md:p-4 grid gap-3">
                  {products.map((p: any) => (
                    <div key={p.id} className={`p-4 md:p-5 border border-gray-100 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-blue-200 transition-all bg-white ${!p.is_active ? 'opacity-50 grayscale' : ''}`}>
                      <div className="flex items-start md:items-center gap-4 w-full md:w-auto flex-1 text-gray-900">
                        <div className="w-16 h-16 bg-gray-100 rounded-xl overflow-hidden border flex-shrink-0">{p.image_url ? <img src={p.image_url} alt="Ürün" className="w-full h-full object-cover" /> : <UtensilsCrossed className="m-auto text-gray-300 h-full w-8" />}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1"><div className="font-black text-base md:text-lg leading-tight">{p.name}</div></div>
                          {p.description && <p className="text-xs text-gray-500 font-medium italic line-clamp-2">{p.description}</p>}
                          <div className="flex items-center gap-2 mt-2">
                             <span className="text-[10px] font-black bg-gray-900 text-white px-2 py-0.5 rounded-md uppercase tracking-wider inline-block">{p.categories?.main_group || 'YİYECEKLER'}</span>
                             <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wider inline-block">{p.categories?.name}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-2 md:gap-4 w-full md:w-auto pt-3 md:pt-0 border-t md:border-0 border-gray-100 mt-2 md:mt-0">
                        <div className="flex gap-2"><button onClick={() => openEditModal(p)} className="p-2 md:p-3 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all" title="Düzenle"><Edit3 size={18} /></button><button onClick={() => handleToggleActive(p.id, p.is_active)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] md:text-xs font-black transition-all ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{p.is_active ? <Power size={12} /> : <PowerOff size={12} />} {p.is_active ? 'SATIŞTA' : 'TÜKENDİ'}</button></div>
                        <div className="text-right min-w-[70px]"><div className="text-lg md:text-xl font-black text-blue-600 leading-none">{p.price}</div><button onClick={() => handleUpdatePrice(p.id, p.price)} className="text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase mt-1">Fiyatı Değiştir</button></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "categories" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-8">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6 md:mb-8"><h2 className="text-lg md:text-xl font-black text-gray-900 uppercase">Kategoriler</h2><button onClick={() => setIsCategoryModalOpen(true)} className="w-full md:w-auto justify-center bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-1 hover:bg-blue-700 shadow-lg transition-all"><Plus size={18}/> Yeni Kategori</button></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map((c: any) => (
                    <div key={c.id} className="p-4 bg-gray-50 rounded-2xl font-black text-gray-700 border border-gray-100 flex justify-between items-center group transition-all">
                      <div className="flex flex-col text-left">
                         <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">{c.main_group || 'YİYECEKLER'}</span>
                         {c.name}
                      </div>
                      <button onClick={() => handleDeleteCategory(c.id, c.name)} title="Kategoriyi Sil" className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-xl transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "qr" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-12 max-w-md mx-auto text-center"><div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 md:mb-8 shadow-inner"><QrCode size={32} /></div><h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-2 tracking-tighter">QR Üretici</h2><input type="text" placeholder="Masa No (Örn: 5)" className="w-full border-2 border-gray-100 p-4 md:p-5 rounded-2xl mb-4 md:mb-6 text-center text-xl md:text-2xl font-black text-gray-900 focus:border-blue-500 outline-none transition-all" value={tableNumber} onChange={e => setTableNumber(e.target.value)} /><button onClick={downloadQRCode} className="w-full bg-gray-900 text-white py-4 md:py-5 rounded-2xl font-black shadow-xl hover:bg-black transition-all">QR Kodu Aç / İndir</button></div>
            )}

            {activeTab === "settings" && (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-10 max-w-2xl mx-auto">
                <h2 className="text-xl md:text-2xl font-black mb-6 md:mb-8 text-gray-900">Marka Kimliği</h2>
                <div className="space-y-6 md:space-y-8">
                  <div>
                    <label className="block text-[10px] md:text-xs font-black text-gray-400 mb-2 md:mb-3 uppercase tracking-widest">Restoran Logosu</label>
                    {settings.logo_url && !logoFile && (<div className="mb-4 bg-gray-50 p-4 rounded-2xl inline-block border-2 border-gray-100 w-full text-center md:text-left"><img src={settings.logo_url} alt="Logo" className="h-12 md:h-16 object-contain mx-auto md:mx-0" /></div>)}
                    <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files ? e.target.files[0] : null)} className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 outline-none" />
                  </div>

                  <div className="p-4 md:p-6 border-2 border-green-100 rounded-3xl bg-green-50/30">
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon2 size={18} className="text-green-600" />
                      <label className="text-xs md:text-sm font-black text-green-900 uppercase">Açılış (Karşılama) Görseli</label>
                    </div>
                    <p className="text-[10px] md:text-xs font-bold text-gray-500 mb-4">Müşteri QR okuttuğunda çıkan tam ekran dikey arka plan (Örn: Mekan fotoğrafı).</p>
                    {settings.welcome_bg_url && !welcomeBgFile && (<div className="mb-4 w-24 h-32 rounded-xl overflow-hidden border-2 border-green-200"><img src={settings.welcome_bg_url} alt="Karşılama" className="w-full h-full object-cover" /></div>)}
                    <input type="file" accept="image/*" onChange={e => setWelcomeBgFile(e.target.files ? e.target.files[0] : null)} className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-green-100 file:text-green-800 hover:file:bg-green-200 outline-none" />
                  </div>

                  <div className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-2"><ImageIcon size={18} className="text-blue-500" /><label className="text-xs md:text-sm font-black text-gray-900 uppercase">Menü İçi Vitrin Görselleri</label></div>
                    <p className="text-[10px] md:text-xs font-bold text-gray-400 mb-4">En fazla 3 adet, yatay (16:9).</p>
                    {settings.slider_images.length > 0 && (<div className="flex gap-3 mb-4 overflow-x-auto pb-2 no-scrollbar">{settings.slider_images.map((img: string, idx: number) => (<div key={idx} className="relative w-24 h-16 md:w-32 md:h-20 bg-gray-200 rounded-xl overflow-hidden flex-shrink-0 shadow-sm border border-gray-200"><img src={img} alt="Slider" className="w-full h-full object-cover" /><button onClick={() => removeSliderImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white p-1 md:p-1.5 rounded-lg hover:bg-red-600 shadow-md"><X size={12} strokeWidth={4} /></button></div>))}</div>)}
                    {settings.slider_images.length < 3 && (<div className="relative mt-2"><input type="file" accept="image/*" onChange={handleSliderUpload} disabled={uploadingSlider} className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-2 md:file:mr-4 file:py-2 md:file:py-3 file:px-4 md:file:px-6 file:rounded-xl file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer disabled:opacity-50" />{uploadingSlider && <div className="absolute top-3 right-4 text-xs font-black text-blue-600 animate-pulse">Yükleniyor...</div>}</div>)}
                  </div>
                  <div><label className="block text-[10px] md:text-xs font-black text-gray-400 mb-2 md:mb-3 uppercase tracking-widest">Marka Rengi</label><div className="flex gap-3 md:gap-4 p-3 md:p-4 bg-gray-50 rounded-2xl border-2 border-gray-50"><input type="color" className="w-12 h-12 md:w-16 md:h-16 rounded-xl cursor-pointer border-0 p-0 bg-transparent" value={settings.primary_color} onChange={e => setSettings({...settings, primary_color: e.target.value})} /><input type="text" className="flex-1 bg-transparent font-mono font-black text-lg md:text-xl text-gray-900 outline-none w-full" value={settings.primary_color} onChange={e => setSettings({...settings, primary_color: e.target.value})} /></div></div>
                  <button onClick={handleSaveSettings} disabled={isSaving} className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all">{isSaving ? "KAYDEDİLİYOR..." : "AYARLARI KAYDET"}</button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh] md:max-h-[90vh]">
                <div className="p-4 md:p-8 border-b flex justify-between items-center"><h3 className="font-black text-xl md:text-2xl text-gray-900 tracking-tighter">{editingProductId ? "Ürünü Düzenle" : "Yeni Ürün Ekle"}</h3><button type="button" onClick={() => {setIsProductModalOpen(false); setEditingProductId(null);}} className="text-gray-300 hover:text-gray-900 bg-gray-100 p-1 md:p-2 rounded-full"><X size={24} /></button></div>
                <form onSubmit={handleProductSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6 overflow-y-auto text-gray-900 pb-20 md:pb-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><select required className="w-full border-2 border-gray-50 bg-gray-50 p-3 md:p-4 rounded-2xl font-bold outline-none focus:border-blue-500 text-gray-900 text-sm md:text-base" value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})}><option value="">Kategori Seç</option>{categories.map((cat: any) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.main_group || 'YİYECEKLER'})</option>)}</select><input required type="text" placeholder="Fiyat (Örn: 250 ₺)" className="w-full border-2 border-gray-50 bg-gray-50 p-3 md:p-4 rounded-2xl font-black outline-none focus:border-blue-500 text-gray-900 text-sm md:text-base" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} /></div>
                    <div className="p-4 md:p-6 bg-blue-50 rounded-2xl md:rounded-[2rem] border border-blue-100 space-y-3 md:space-y-4"><input required placeholder="Ürün Adı" className="w-full bg-white p-3 md:p-4 rounded-xl font-black text-gray-900 outline-none shadow-sm text-sm md:text-base" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} /><textarea placeholder="Açıklama..." className="w-full bg-white p-3 md:p-4 rounded-xl font-medium text-gray-600 text-xs md:text-sm outline-none shadow-sm" rows={2} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} /></div>
                    <div className="p-4 md:p-5 border-2 border-gray-50 rounded-2xl"><div className="flex flex-wrap gap-1.5 md:gap-2">{ALLERGEN_OPTIONS.map((alg: any) => (<button key={alg.id} type="button" onClick={() => toggleAllergen(alg.id)} className={`px-2 md:px-3 py-1.5 md:py-2 rounded-xl text-[10px] md:text-xs font-bold flex items-center gap-1 md:gap-1.5 transition-all ${newProduct.allergens?.includes(alg.id) ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}><span>{alg.icon}</span> {alg.label}</button>))}</div></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-gray-400 uppercase ml-2">Ürün Görseli</label><input type="file" className="w-full text-[10px] md:text-xs font-bold text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700" onChange={e => setNewProduct({...newProduct, file: e.target.files ? e.target.files[0] : null})} /></div>
                    <button disabled={uploading} type="submit" className="w-full bg-blue-600 text-white py-4 md:py-5 rounded-2xl md:rounded-[1.5rem] font-black text-base md:text-lg shadow-xl hover:bg-blue-700 transition-all uppercase mt-4">{uploading ? "İŞLENİYOR..." : editingProductId ? "KAYDET" : "EKLE"}</button>
                </form>
            </div>
        </div>
      )}

      {/* YENİ: Akıllı Ana Grup Girişi */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm p-6 md:p-8 shadow-2xl">
                <h3 className="font-black text-lg md:text-xl mb-6 text-gray-900">Yeni Kategori</h3>
                <form onSubmit={handleAddCategory}>
                  
                  {/* Akıllı Input Başlangıcı */}
                  <input 
                    list="main-groups-list"
                    required 
                    placeholder="Ana Grup (Örn: TATLILAR, YİYECEKLER)" 
                    className="w-full border-2 border-gray-50 bg-gray-50 p-3 md:p-4 rounded-2xl mb-4 font-black text-gray-900 outline-none text-sm md:text-base uppercase" 
                    value={newCategory.main_group} 
                    onChange={e => setNewCategory({...newCategory, main_group: e.target.value.toLocaleUpperCase('tr-TR')})} 
                  />
                  <datalist id="main-groups-list">
                    <option value="YİYECEKLER" />
                    <option value="İÇECEKLER" />
                    {/* Bu restorana ait daha önceden girilmiş farklı ana grupları otomatik listele */}
                    {Array.from(new Set(categories.map((c: any) => c.main_group))).filter(mg => mg && mg !== 'YİYECEKLER' && mg !== 'İÇECEKLER').map((mg: any) => (
                        <option key={mg} value={mg} />
                    ))}
                  </datalist>
                  {/* Akıllı Input Sonu */}

                  <input required placeholder="Alt Kategori (Örn: Kahvaltı, Burger)" className="w-full border-2 border-gray-50 bg-gray-50 p-3 md:p-4 rounded-2xl mb-6 font-black text-gray-900 outline-none text-sm md:text-base" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} />
                  <div className="flex gap-3 md:gap-4"><button type="button" onClick={() => setIsCategoryModalOpen(false)} className="flex-1 font-bold text-gray-400 text-sm md:text-base">İptal</button><button type="submit" className="flex-1 bg-blue-600 text-white py-3 md:py-4 rounded-2xl font-black shadow-lg text-sm md:text-base">Ekle</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}