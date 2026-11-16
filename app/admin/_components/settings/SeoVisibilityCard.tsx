"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

type Props = {
  restaurantId: string;
  /** DB'deki değer; kolon yoksa/boşsa açık sayılır. */
  value: boolean;
  onSaved: (value: boolean) => void;
};

/** Faz 2.11a: menü ve ürün sayfaları Google'da görünsün mü? (QR ile açılış her durumda çalışır.) */
export function SeoVisibilityCard({ restaurantId, value, onSaved }: Props) {
  const [checked, setChecked] = useState(value);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = async (next: boolean) => {
    const previous = checked;
    setChecked(next);
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("restaurants").update({ seo_indexable: next }).eq("id", restaurantId);
    setBusy(false);
    if (error) {
      setChecked(previous);
      setMessage({ ok: false, text: `Kaydedilemedi: ${error.message || "bilinmeyen hata"}` });
      return;
    }
    onSaved(next);
    setMessage({
      ok: true,
      text: next
        ? "Kaydedildi. Menünüz Google'da çıkabilir (Google'ın güncellemesi günler sürebilir)."
        : "Kaydedildi. Menünüz Google'a kapatıldı; Google'ın listeden kaldırması günler sürebilir.",
    });
  };

  return (
    <section
      className="p-4 md:p-6 border-2 border-gray-100 rounded-3xl bg-gray-50/50 space-y-3"
      aria-busy={busy}
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Search size={18} className="text-emerald-600" aria-hidden />
          <h3 className="text-xs md:text-sm font-black text-gray-900 uppercase">Google&apos;da Görünürlük</h3>
        </div>
        <p id="seo-visibility-help" className="text-[10px] md:text-xs font-bold text-gray-500 leading-snug">
          Açıkken menünüz ve ürün sayfalarınız Google gibi arama motorlarında çıkabilir. Kapalıyken yalnızca QR
          kodu veya linki bilen kişiler görür. QR kodlarınız her iki durumda da aynen çalışır.
        </p>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={busy}
          aria-describedby="seo-visibility-help"
          onChange={(e) => void toggle(e.target.checked)}
          className="h-5 w-5 rounded border-gray-300"
        />
        <span className="text-sm font-black text-gray-900">Menüm Google&apos;da görünsün</span>
      </label>

      <p className="text-[10px] md:text-xs font-bold text-gray-400 leading-snug">
        Otel oda servisi gibi yalnızca misafirlere özel menüleri Google&apos;a kapatmanız önerilir.
      </p>

      {/* Canlı bölge sürekli DOM'da kalır: ekran okuyucular sonradan gelen mesajı kaçırmasın. */}
      <p
        role="status"
        aria-live="polite"
        className={`min-h-4 text-xs font-bold ${message?.ok === false ? "text-red-600" : "text-green-700"}`}
      >
        {message?.text ?? ""}
      </p>
    </section>
  );
}
