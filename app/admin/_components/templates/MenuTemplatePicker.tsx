"use client";

import { useRef, useState } from "react";
import { LayoutTemplate, Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { applyMenuTemplate } from "@/lib/menu-templates/apply";
import {
  MENU_TEMPLATES,
  countTemplateProducts,
  type MenuTemplate,
  type MenuTemplateId,
} from "@/lib/menu-templates/templates";
import { ConfirmDialog } from "@/app/admin/_components/ConfirmDialog";

const supabase = getBrowserSupabase();

type Row = Record<string, unknown>;

type Props = {
  restaurantId: string;
  /** Aktif menü sayısı; ≥2 ise içerik yalnız ilk menüde görünür (uyarı gösterilir). */
  activeMenuCount: number;
  onApplied: (result: { categories: Row[]; products: Row[]; template: MenuTemplate }) => void;
};

/**
 * Faz 2.11c: boş menü için hazır şablon seçimi. Yalnızca kategori ve ürün sayısı 0 iken gösterilir;
 * yükleme sırasında da sunucu tarafında (RLS'li istemci) menünün boş olduğu yeniden kontrol edilir.
 */
export function MenuTemplatePicker({ restaurantId, activeMenuCount, onApplied }: Props) {
  const [pendingId, setPendingId] = useState<MenuTemplateId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // State güncellemesi bir sonraki render'a kadar gecikir; çift tıkta ikinci yüklemeyi ref ile anında engelle.
  const lockRef = useRef(false);

  const pending = MENU_TEMPLATES.find((t) => t.id === pendingId) ?? null;

  const apply = async () => {
    if (!pending || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await applyMenuTemplate(supabase, restaurantId, pending);
      setPendingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onApplied({ categories: result.categories, products: result.products, template: pending });
    } catch {
      setPendingId(null);
      setError("Şablon yüklenirken beklenmeyen bir hata oluştu. Menünüzü kontrol edip tekrar deneyin.");
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="px-2 py-6 md:py-8 space-y-5">
      <div className="text-center space-y-2">
        <LayoutTemplate size={30} className="mx-auto text-blue-500" aria-hidden />
        <h3 className="text-base md:text-lg font-black text-gray-900">Hazır şablonla hızlı başlayın</h3>
        <p className="mx-auto max-w-xl text-xs md:text-sm font-bold text-gray-500 leading-snug">
          Menünüz boş. Sektörünüze uygun bir şablon seçin: kategoriler ve örnek ürünler (Türkçe + İngilizce) tek
          tıkla eklenir. <strong className="text-gray-700">Fiyatlar boş gelir</strong>, siz doldurursunuz. İstemediğiniz
          ürünleri silebilir, her şeyi düzenleyebilirsiniz. Şablonlar yalnızca boş menüye yüklenir.
        </p>
      </div>

      {error && (
        <p role="alert" className="mx-auto max-w-xl rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {MENU_TEMPLATES.map((template) => (
          <section key={template.id} className="flex flex-col rounded-3xl border-2 border-gray-100 bg-white p-4 md:p-5">
            <div className="flex items-center gap-3">
              <span className="text-3xl" aria-hidden>
                {template.emoji}
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-black uppercase text-gray-900">{template.title}</h4>
                <p className="text-[11px] font-bold text-gray-500">
                  {template.categories.length} kategori · {countTemplateProducts(template)} ürün
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs font-bold text-gray-500 leading-snug">{template.blurb}</p>

            <details className="group mt-3 rounded-2xl bg-gray-50 px-3">
              <summary className="min-h-11 cursor-pointer list-none py-3 text-xs font-black text-gray-700 flex items-center justify-between">
                <span>İçeriği göster</span>
                <span className="text-[10px] font-bold text-gray-500 group-open:hidden">Aç</span>
                <span className="hidden text-[10px] font-bold text-gray-500 group-open:inline">Kapat</span>
              </summary>
              <ul className="space-y-2 pb-3">
                {template.categories.map((c) => (
                  <li key={c.name} className="text-[11px] font-bold text-gray-600 leading-snug">
                    <span className="font-black text-gray-800">{c.name}</span> ({c.products.length}):{" "}
                    {c.products.map((p) => p.name).join(", ")}
                  </li>
                ))}
              </ul>
            </details>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setPendingId(template.id);
              }}
              className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy && pendingId === template.id ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
              Bu şablonu yükle
            </button>
          </section>
        ))}
      </div>

      <p className="text-center text-[11px] font-bold text-gray-500">
        Şablonu kullanmak istemezseniz &quot;Kategoriler&quot; sekmesinden bir kategori ekleyip ürünlerinizi kendiniz oluşturabilirsiniz.
      </p>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? `"${pending.title}" şablonu yüklensin mi?` : ""}
        message={
          pending
            ? `${pending.categories.length} kategori ve ${countTemplateProducts(pending)} ürün menünüze eklenecek. Fiyatlar, alerjen bilgisi ve fotoğraflar boş gelir. Ürünler hemen müşteri menüsünde görünür; yayından önce fiyatları girin ve istemediklerinizi silin.${
                pending.categories.some((c) => c.draft)
                  ? " Bar gibi taslak işaretli kategoriler yayında gelmez, isterseniz yayına alırsınız."
                  : ""
              }${
                activeMenuCount >= 2
                  ? " Birden fazla menünüz var: şablon içeriği yalnızca ilk menünüzde görünür; diğer menülere sonradan ürünler sekmesindeki toplu menü işleminden ekleyebilirsiniz."
                  : ""
              }`
            : ""
        }
        confirmLabel="Yükle"
        busyLabel="Yükleniyor…"
        tone="primary"
        busy={busy}
        onConfirm={() => void apply()}
        onCancel={() => setPendingId(null)}
      />
    </div>
  );
}
