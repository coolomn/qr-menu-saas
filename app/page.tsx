import Link from "next/link";
import { QrCode, Smartphone, Zap, ArrowRight, ShieldCheck, Settings } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* Üst Menü (Navbar) */}
      <nav className="flex items-center justify-between p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <QrCode className="text-blue-600" size={32} />
          <span className="text-2xl font-black tracking-tight text-gray-900">TapMenu</span>
        </div>
        <div className="flex gap-4">
          <Link href="/menu/nuup" className="hidden md:flex items-center text-gray-600 hover:text-gray-900 font-medium transition-colors">
            Canlı Demo
          </Link>
          <Link href="/admin/login" className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 font-semibold rounded-lg shadow-sm hover:bg-gray-50 transition-all">
            Müşteri Girişi
          </Link>
        </div>
      </nav>

      {/* Kahraman Alanı (Hero Section) */}
      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold mb-8 border border-blue-100">
          <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse"></span>
          Yeni Nesil QR Menü Sistemi Yayında!
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black text-gray-900 tracking-tight leading-tight mb-6">
          Restoranınızın Menüsü <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">
            Artık Dijitalde.
          </span>
        </h1>
        
        <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          Kâğıt menü masraflarına son verin. Saniyeler içinde kendi menünüzü oluşturun, fiyatları anında güncelleyin ve müşterilerinize kusursuz bir deneyim sunun.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/menu/nuup" className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
            Örnek Menüyü İncele <ArrowRight size={20} />
          </Link>
          <Link href="/admin/login" className="w-full sm:w-auto px-8 py-4 bg-white text-gray-800 font-bold rounded-xl border border-gray-200 shadow-sm hover:bg-gray-50 transition-all flex items-center justify-center gap-2">
            <Settings size={20} className="text-gray-500" /> Yönetim Paneli
          </Link>
        </div>
      </main>

      {/* Özellikler (Features) */}
      <section className="bg-white border-y border-gray-100 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Neden TapMenu?</h2>
            <p className="text-gray-500">Restoranınızı geleceğe taşıyacak tüm özellikler tek bir yerde.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-10">
            {/* Özellik 1 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-6">
                <Zap size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Anında Güncelleme</h3>
              <p className="text-gray-600 leading-relaxed">
                Fiyat değiştirmek veya yeni ürün eklemek saniyeler sürer. Matbaayı beklemeden anında menünüzü güncelleyin.
              </p>
            </div>

            {/* Özellik 2 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <div className="w-14 h-14 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-6">
                <Smartphone size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Mobil Uyumlu Tasarım</h3>
              <p className="text-gray-600 leading-relaxed">
                Uygulama indirmeye gerek yok. Müşteriler kamerayı açıp QR kodu okutarak menünüze pürüzsüzce ulaşır.
              </p>
            </div>

            {/* Özellik 3 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100">
              <div className="w-14 h-14 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Güvenli Yönetim</h3>
              <p className="text-gray-600 leading-relaxed">
                Size özel yönetim paneli ile verilerinizi güvenle saklayın. Kategori bazlı düzenleme ve resim yükleme çok kolay.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-8 border-t border-gray-100 text-center text-gray-500 text-sm">
        <p>© {new Date().getFullYear()} TapMenu. US Kreatif Tasarım & Reklam Ajansı Tarafından Geliştirilmiştir.</p>
      </footer>

    </div>
  );
}