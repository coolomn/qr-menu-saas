"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { LogOut, Settings, LayoutDashboard, UtensilsCrossed, QrCode, Edit2, Plus, X, Upload } from "lucide-react";

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

  // Yeni Ürün Ekleme (Modal) State'leri
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "", description: "", price: "", category_id: "", file: null as File | null
  });

  useEffect(() => {
    const checkUserAndFetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/admin/login"); return; }
      setUser(session.user);

      const { data: resData } = await supabase.from("restaurants").select("*").single();
      if (resData) {
        setRestaurant(resData);
        
        // Kategorileri çek (Açılır listede seçmek için)
        const { data: catData } = await supabase.from("categories").select("*").eq("restaurant_id", resData.id);
        if (catData) setCategories(catData);

        // Ürünleri çek
        const { data: prodData } = await supabase.from("products").select("*, categories(name)").eq("categories.restaurant_id", resData.id);
        if (prodData) setProducts(prodData);
      }
      setLoading(false);
    };

    checkUserAndFetchData();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  const handleUpdatePrice = async (productId: string, currentPrice: string) => {
    const newPrice = window.prompt("Yeni fiyatı girin (Örn: 500 ₺):", currentPrice);
    if (newPrice && newPrice !== currentPrice) {
      const { error } = await supabase.from("products").update({ price: newPrice }).eq("id", productId);
      if (!error) {
        setProducts(products.map(p => p.id === productId ? { ...p, price: newPrice } : p));
      }
    }
  };

  // YENİ ÜRÜN KAYDETME FONKSİYONU
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    let imageUrl = null;

    // 1. Eğer resim seçildiyse önce resmi Storage'a yükle
    if (newProduct.file) {
      const fileExt = newProduct.file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`; // Rastgele isim veriyoruz karışmasın diye
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(fileName, newProduct.file);

      if (!uploadError) {
        // Yüklenen resmin herkese açık linkini al
        const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
        imageUrl = publicUrlData.publicUrl;
      } else {
        alert("Resim yüklenirken hata oluştu.");
      }
    }

    // 2. Ürün bilgilerini (ve varsa resim linkini) veritabanına kaydet
    const { data, error } = await supabase.from("products").insert([
      {
        category_id: newProduct.category_id,
        name: newProduct.name,
        description: newProduct.description,
        price: newProduct.price,
        image_url: imageUrl,
        is_active: true
      }
    ]).select("*, categories(name)").single();

    if (error) {
      alert("Ürün eklenirken bir hata oluştu.");
    } else if (data) {
      // Tabloya yeni ürünü anında ekle
      setProducts([...products, data]);
      // Formu temizle ve kapat
      setIsModalOpen(false);
      setNewProduct({ name: "", description: "", price: "", category_id: "", file: null });
    }
    setUploading(false);
  };

  if (loading) return <div className="flex h-screen items-center justify-center font-bold text-gray-500">Yükleniyor...</div>;

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      
      {/* Sol Menü */}
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col hidden md:flex">
        <div className="p-6 border-b flex items-center gap-3">
          <QrCode className="text-blue-600" size={28} />
          <h2 className="text-xl font-bold text-gray-800">QR Panel</h2>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-600 rounded-lg font-medium">
            <UtensilsCrossed size={20} /> Menü Yönetimi
          </button>
        </nav>
        <div className="p-4 border-t">
          <button onClick={handleLogout} className="flex items-center gap-3 text-red-600 hover:bg-red-50 w-full px-4 py-3 rounded-lg font-medium">
            <LogOut size={20} /> Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Ana İçerik */}
      <main className="flex-1 p-8 overflow-y-auto relative">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800">{restaurant?.name} Yönetimi</h1>
        </header>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <UtensilsCrossed size={20} className="text-blue-600" /> Ürün Listesi
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1"
            >
              <Plus size={18} /> Yeni Ürün Ekle
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
                  <th className="p-4 font-medium text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      {product.image_url ? (
                         <img src={product.image_url} alt={product.name} className="w-12 h-12 rounded-lg object-cover border" />
                      ) : (
                         <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 text-xs">Yok</div>
                      )}
                    </td>
                    <td className="p-4 font-bold text-gray-800">{product.name}</td>
                    <td className="p-4 text-sm text-gray-500">{product.categories?.name}</td>
                    <td className="p-4">
                      <span className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded-full text-sm">{product.price}</span>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => handleUpdatePrice(product.id, product.price)} className="text-blue-600 hover:underline font-medium">
                        Fiyat Değiştir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* YENİ ÜRÜN EKLEME MODALI (PENCERESİ) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg text-gray-800">Yeni Ürün Ekle</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
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
                <input type="file" accept="image/*" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" 
                  onChange={e => setNewProduct({...newProduct, file: e.target.files ? e.target.files[0] : null})} 
                />
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