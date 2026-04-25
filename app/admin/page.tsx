"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { LogOut, LayoutDashboard, UtensilsCrossed, QrCode, Plus, X, List, Power, PowerOff, Download } from "lucide-react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  const [restaurant, setRestaurant] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  // Sekme (Tab) Yönetimi
  const [activeTab, setActiveTab] = useState("products"); // 'products', 'categories', 'qr'

  // QR Kod İçin Masa Numarası State'i
  const [tableNumber, setTableNumber] = useState("1");

  // Modallar
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form State'leri
  const [newProduct, setNewProduct] = useState({ name: "", description: "", price: "", category_id: "", file: null as File | null });
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    const checkUserAndFetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/admin/login"); return; }
      setUser(session.user);

      const { data: resData } = await supabase.from("restaurants").select("*").eq("owner_id", session.user.id).single();
      if (resData) {
        setRestaurant(resData);
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id);
        if (catData) setCategories(catData);
        const { data: prodData } = await supabase.from("products").select("*, categories(name)").eq("categories.restaurant_id", resData.id);
        if (prodData) setProducts(prodData);
      } else {
        alert("Hesabınıza tanımlı bir restoran bulunamadı.");
      }
      setLoading(false);
    };
    checkUserAndFetchData();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    const { error } = await supabase.from("products").update({ is_active: !currentStatus }).eq("id", productId);
    if (!error) setProducts(products.map(p => p.id === productId ? { ...p, is_active: !currentStatus } : p));
  };

  const handleUpdatePrice = async (productId: string, currentPrice: string) => {
    const newPrice = window.prompt("Yeni fiyatı girin (Örn: 500 ₺):", currentPrice);
    if (newPrice && newPrice !== currentPrice) {
      const { error } = await supabase.from("products").update({ price: newPrice }).eq("id", productId);
      if (!error) setProducts(products.map(p => p.id === productId ? { ...p, price: newPrice } : p));
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const { data, error } = await supabase.from("categories").insert([{ restaurant_id: restaurant.id, name: newCategoryName, sort_order: categories.length }]).select().single();
    if (!error && data) { setCategories([...categories, data]); setNewCategoryName(""); setIsCategoryModalOpen(false); }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    let imageUrl = null;
    if (newProduct.file) {
      const fileName = `${Math.random()}.${newProduct.file.name.split('.').pop()}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from('menu-images').upload(fileName, newProduct.file);
      if (!uploadError) imageUrl = supabase.storage.from('menu-images').getPublicUrl(fileName).data.publicUrl;
    }
    const { data, error } = await supabase.from("products").insert([{ category_id: newProduct.category_id, name: newProduct.name, description: newProduct.description, price: newProduct.price, image_url: imageUrl, is_active: true }]).select("*, categories(name)").single();
    if (!error && data) { setProducts([...products, data]); setIsProductModalOpen(false); setNewProduct({ name: "", description: "", price: "", category_id: "", file: null }); }
    setUploading(false);
  };

  // QR KOD İNDİRME FONKSİYONU
  const downloadQRCode = async () => {
    try {
      // Bağlantı Linki (İleride 'nuup' yerine restaurant.slug da kullanılabilir)
      const menuLink = `https://tapmenu.com.tr/menu/nuup${tableNumber ? `?masa=${tableNumber}` : ""}`;
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=${encodeURIComponent(menuLink)}&margin=20`;
      
      const response = await fetch(qrApiUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `TapMenu-${restaurant.name}-Masa-${tableNumber || 'Genel'}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert("QR Kod indirilirken bir hata oluştu.");
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center font-bold text-gray-500">Sistem Hazırlanıyor...</div>;
  if (!restaurant) return <div className="flex h-screen items-center justify-center font-bold text-red-500">Restoran bulunamadı.</div>;

  // QR Kod Canlı Önizleme Linki
  const liveQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://tapmenu.com.tr/menu/nuup${tableNumber ? `?masa=${tableNumber}` : ""}`)}`;

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col hidden md:flex z-10 relative">
        <div className="p-6 border-b flex items-center gap-3">
          <QrCode className="text-blue-600" size={28} />
          <h2 className="text-xl font-bold text-gray-800">TapMenu</h2>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-600 rounded-lg font-medium">
            <LayoutDashboard size={20} /> Menü Yönetimi
          </button>
        </nav>
        <div className="p-4 border-t">
          <button onClick={handleLogout} className="flex items-center gap-3 text-red-600 hover:bg-red-50 w-full px-4 py-3 rounded-lg font-medium transition-colors">
            <LogOut size={20} /> Çıkış Yap
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">{restaurant.name}</h1>
            <p className="text-gray-500 mt-1">Sisteme <span className="font-semibold text-blue-600">{user.email}</span> yetkisiyle bağlandınız.</p>
          </header>

          <div className="flex gap-4 border-b border-gray-200 mb-6">
            <button onClick={() => setActiveTab("products")} className={`pb-3 px-2 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === "products" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <UtensilsCrossed size={18} /> Ürünler
            </button>
            <button onClick={() => setActiveTab("categories")} className={`pb-3 px-2 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === "categories" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <List size={18} /> Kategoriler
            </button>
            {/* YENİ EKLENEN QR KOD SEKMESİ */}
            <button onClick={() => setActiveTab("qr")} className={`pb-3 px-2 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === "qr" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              <QrCode size={18} /> QR Kod Üret
            </button>
          </div>

          {activeTab === "products" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800">Ürün Listesi</h2>
                <button onClick={() => setIsProductModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                  <Plus size={18} /> Yeni Ürün
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b text-gray-500 text-sm">
                      <th className="p-4 font-medium">Görsel</th>
                      <th className="p-4 font-medium">Ürün Adı</th>
                      <th className="p-4 font-medium">Kategori</th>
                      <th className="p-4 font-medium">Fiyat</th>
                      <th className="p-4 font-medium">Durum</th>
                      <th className="p-4 font-medium text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((product) => (
                      <tr key={product.id} className={`hover:bg-gray-50 transition-colors ${!product.is_active ? 'opacity-50 grayscale' : ''}`}>
                        <td className="p-4">
                          {product.image_url ? <img src={product.image_url} alt={product.name} className="w-12 h-12 rounded-lg object-cover border" /> : <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs">Yok</div>}
                        </td>
                        <td className="p-4 font-bold text-gray-800">{product.name}</td>
                        <td className="p-4 text-sm text-gray-500">{product.categories?.name}</td>
                        <td className="p-4 font-bold text-gray-800">{product.price}</td>
                        <td className="p-4">
                          <button onClick={() => handleToggleActive(product.id, product.is_active)} className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-colors ${product.is_active ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700'}`}>
                            {product.is_active ? <><Power size={14} /> Satışta</> : <><PowerOff size={14} /> Tükendi</>}
                          </button>
                        </td>
                        <td className="p-4 text-right">
                          <button onClick={() => handleUpdatePrice(product.id, product.price)} className="text-blue-600 hover:underline font-medium text-sm">Fiyat Değiştir</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "categories" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800">Kategori Listesi</h2>
                <button onClick={() => setIsCategoryModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                  <Plus size={18} /> Yeni Kategori
                </button>
              </div>
              <div className="p-4">
                <ul className="space-y-2">
                  {categories.map((cat) => (
                    <li key={cat.id} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg shadow-sm">
                      <span className="font-bold text-gray-800">{cat.name}</span>
                      <span className="text-sm text-gray-400">Sıra: {cat.sort_order}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* YENİ: QR KOD SAYFASI İÇERİĞİ */}
          {activeTab === "qr" && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden p-8 flex flex-col md:flex-row gap-10 items-center justify-center">
              <div className="flex-1 space-y-6 max-w-sm">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">QR Kod Üretici</h2>
                  <p className="text-gray-500 mt-2 text-sm leading-relaxed">
                    Masalarınıza veya broşürlerinize basmak için yüksek çözünürlüklü (1000x1000) QR kodlarınızı buradan saniyeler içinde oluşturup indirebilirsiniz.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Masa Numarası (Opsiyonel)</label>
                  <input 
                    type="text" 
                    placeholder="Örn: 5, Teras-1 veya Bahçe" 
                    className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-blue-500 focus:ring-0 outline-none transition-colors" 
                    value={tableNumber} 
                    onChange={e => setTableNumber(e.target.value)} 
                  />
                  <p className="text-xs text-gray-400 mt-2">Masa numarasını boş bırakırsanız genel bir menü QR kodu üretilir.</p>
                </div>
                <button onClick={downloadQRCode} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2">
                  <Download size={20} /> Kaliteli PNG Olarak İndir
                </button>
              </div>
              
              <div className="flex-1 flex justify-center md:border-l border-gray-100 md:pl-10">
                <div className="p-6 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50 text-center flex flex-col items-center">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                    <img src={liveQrUrl} alt="QR Code" className="w-48 h-48" />
                  </div>
                  <p className="text-sm font-bold text-gray-600 mt-6 bg-gray-200 px-4 py-1.5 rounded-full">
                    Önizleme: Masa {tableNumber || 'Genel'}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* MODALLAR (Kategori ve Ürün) BURADA DEVAM EDİYOR (Aynı) */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg text-gray-800">Yeni Kategori Ekle</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddCategory} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori Adı</label>
                <input required type="text" placeholder="Örn: Tatlılar" className="w-full border p-2 rounded-lg" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4">Kategoriyi Kaydet</button>
            </form>
          </div>
        </div>
      )}

      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg text-gray-800">Yeni Ürün Ekle</h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddProduct} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Adı</label>
                <input required type="text" className="w-full border p-2 rounded-lg" value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <select required className="w-full border p-2 rounded-lg" value={newProduct.category_id} onChange={e => setNewProduct({...newProduct, category_id: e.target.value})}>
                  <option value="">Kategori Seçin</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fiyat (Örn: 150 ₺)</label>
                <input required type="text" className="w-full border p-2 rounded-lg" value={newProduct.price} onChange={e => setNewProduct({...newProduct, price: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <textarea className="w-full border p-2 rounded-lg" rows={2} value={newProduct.description} onChange={e => setNewProduct({...newProduct, description: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ürün Görseli</label>
                <input type="file" accept="image/*" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700" onChange={e => setNewProduct({...newProduct, file: e.target.files ? e.target.files[0] : null})} />
              </div>
              <button disabled={uploading} type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg mt-4 disabled:bg-blue-300">
                {uploading ? "Kaydediliyor..." : "Ürünü Kaydet"}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}