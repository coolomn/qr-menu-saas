"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { translateText } from "@/lib/admin-menu/auto-translate-client";
import {
  emptyModifierOption,
  fillMissingModifierTranslations,
  saveModifierGroup,
  validateModifierGroup,
  type AdminModifierGroup,
  type AdminModifierOption,
} from "@/lib/admin-menu/modifiers";
import { MAX_OPTIONS_PER_GROUP } from "@/lib/public-menu/product-extras";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

type Props = {
  restaurantId: string;
  initial: AdminModifierGroup;
  /** Yeni grupta sıra (listenin sonu). */
  sortOrder: number;
  onClose: () => void;
  onSaved: (groupId: string) => void;
};

const input =
  "w-full min-w-0 bg-gray-50 border-2 border-gray-50 focus:border-blue-500 rounded-xl px-3 py-2.5 text-sm font-bold outline-none";
const label = "text-[10px] font-black text-gray-500 uppercase tracking-widest";

/**
 * Faz 2.4: seçenek grubu ekle/düzenle penceresi. Ürün formunun içinden de açıldığı için
 * <form> değil (iç içe form olmaz) ve body'ye portal ile çizilir.
 */
export function ModifierGroupModal({ restaurantId, initial, sortOrder, onClose, onSaved }: Props) {
  const [group, setGroup] = useState<AdminModifierGroup>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Kaydediliyor…");
  const [showTranslations, setShowTranslations] = useState(
    Boolean(initial.name_en || initial.name_ru || initial.options.some((o) => o.name_en || o.name_ru))
  );

  const patchOption = (index: number, patch: Partial<AdminModifierOption>) =>
    setGroup((g) => ({ ...g, options: g.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) }));

  const moveOption = (index: number, dir: -1 | 1) =>
    setGroup((g) => {
      const j = index + dir;
      if (j < 0 || j >= g.options.length) return g;
      const options = [...g.options];
      [options[index], options[j]] = [options[j], options[index]];
      return { ...g, options };
    });

  const save = async () => {
    const invalid = validateModifierGroup(group);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    // Boş İngilizce/Rusça adları otomatik çevir (elle yazılanlara dokunmaz; servis yanıt vermezse
    // Türkçe kalır ve kayıt yine yapılır).
    let toSave = group;
    try {
      setBusyLabel("Çevriliyor…");
      const translated = await fillMissingModifierTranslations(group, translateText);
      toSave = translated.group;
      setGroup(toSave);
    } catch {
      /* çeviri servisi ulaşılamaz: Türkçe adlar gösterilir */
    }
    setBusyLabel("Kaydediliyor…");
    const res = await saveModifierGroup(supabase, restaurantId, toSave, sortOrder);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved(res.id);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={group.id ? "Seçenek grubunu düzenle" : "Yeni seçenek grubu"}
    >
      <div className="bg-white w-full max-w-xl flex flex-col rounded-t-[1.75rem] md:rounded-[2rem] max-h-[calc(100dvh-0.75rem)] md:max-h-[90dvh] shadow-2xl text-gray-900">
        <div className="shrink-0 flex items-center justify-between gap-3 border-b px-4 py-3 md:px-6 md:py-5">
          <h3 className="font-black text-lg md:text-xl tracking-tight">
            {group.id ? "Seçenek grubunu düzenle" : "Yeni seçenek grubu"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-gray-500 hover:text-gray-900 bg-gray-100 rounded-full inline-flex items-center justify-center min-h-11 min-w-11"
            aria-label="Kapat"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="mg-name" className={label}>Grup adı</label>
            <input
              id="mg-name"
              className={input}
              placeholder="Örn: Sos seçimi, Ekstralar"
              value={group.name}
              maxLength={80}
              onChange={(e) => setGroup({ ...group, name: e.target.value })}
            />
            {showTranslations && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input className={input} placeholder="🇬🇧 Group name" value={group.name_en} maxLength={80}
                  aria-label="Grup adı (İngilizce)"
                  onChange={(e) => setGroup({ ...group, name_en: e.target.value })} />
                <input className={input} placeholder="🇷🇺 Название группы" value={group.name_ru} maxLength={80}
                  aria-label="Grup adı (Rusça)"
                  onChange={(e) => setGroup({ ...group, name_ru: e.target.value })} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="mg-min" className={label}>En az seçim</label>
              <input id="mg-min" inputMode="numeric" className={input} placeholder="Zorunlu değil"
                value={group.min_select} onChange={(e) => setGroup({ ...group, min_select: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mg-max" className={label}>En fazla seçim</label>
              <input id="mg-max" inputMode="numeric" className={input} placeholder="Sınırsız"
                value={group.max_select} onChange={(e) => setGroup({ ...group, max_select: e.target.value })} />
            </div>
            <p className="col-span-2 text-[11px] font-medium text-gray-500 leading-snug -mt-1">
              Müşteri menüde örneğin “1 seçin” ya da “en fazla 3” yazısını görür. Sipariş sistemi olmadığı için
              seçenekler yalnızca bilgi olarak gösterilir. Kaydederken boş İngilizce/Rusça adlar otomatik çevrilir.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className={label}>Seçenekler</span>
              <button type="button" onClick={() => setShowTranslations((v) => !v)}
                className="text-[11px] font-bold text-blue-600 hover:underline">
                {showTranslations ? "Çevirileri gizle" : "EN / RU çeviri ekle"}
              </button>
            </div>
            {group.options.map((option, index) => (
              <div key={option.id ?? `new-${index}`}
                className={`rounded-2xl border p-2.5 space-y-2 ${option.is_active ? "border-gray-100 bg-white" : "border-amber-100 bg-amber-50/50"}`}>
                <div className="flex items-center gap-1.5">
                  <input className={`${input} flex-[2]`} placeholder="Seçenek adı (örn: Cheddar)" value={option.name} maxLength={80}
                    aria-label={`Seçenek ${index + 1} adı`}
                    onChange={(e) => patchOption(index, { name: e.target.value })} />
                  <input className={`${input} flex-1 max-w-[6.5rem]`} placeholder="+15" value={option.price_delta} maxLength={20}
                    aria-label={`Seçenek ${index + 1} fiyat farkı`} inputMode="decimal"
                    onChange={(e) => patchOption(index, { price_delta: e.target.value })} />
                </div>
                {showTranslations && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className={input} placeholder="🇬🇧 Name" value={option.name_en} maxLength={80}
                      aria-label={`Seçenek ${index + 1} adı (İngilizce)`}
                      onChange={(e) => patchOption(index, { name_en: e.target.value })} />
                    <input className={input} placeholder="🇷🇺 Название" value={option.name_ru} maxLength={80}
                      aria-label={`Seçenek ${index + 1} adı (Rusça)`}
                      onChange={(e) => patchOption(index, { name_ru: e.target.value })} />
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <input className={`${input} max-w-[7rem]`} placeholder="Kalori" value={option.calories} inputMode="numeric"
                    aria-label={`Seçenek ${index + 1} kalori`}
                    onChange={(e) => patchOption(index, { calories: e.target.value })} />
                  <label className="flex items-center gap-1.5 text-xs font-bold text-gray-700 px-1">
                    <input type="checkbox" checked={option.is_active}
                      onChange={(e) => patchOption(index, { is_active: e.target.checked })} />
                    Menüde göster
                  </label>
                  <span className="ml-auto flex items-center gap-0.5">
                    <button type="button" onClick={() => moveOption(index, -1)} disabled={index === 0}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="Yukarı taşı">
                      <ChevronUp size={15} />
                    </button>
                    <button type="button" onClick={() => moveOption(index, 1)} disabled={index === group.options.length - 1}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="Aşağı taşı">
                      <ChevronDown size={15} />
                    </button>
                    <button type="button"
                      onClick={() => setGroup((g) => ({ ...g, options: g.options.filter((_, i) => i !== index) }))}
                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100" aria-label="Seçeneği sil">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              </div>
            ))}
            <button type="button"
              disabled={group.options.length >= MAX_OPTIONS_PER_GROUP}
              onClick={() => setGroup((g) => ({ ...g, options: [...g.options, emptyModifierOption()] }))}
              className="w-full min-h-11 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-600 hover:border-blue-300 hover:text-blue-600 inline-flex items-center justify-center gap-1.5 disabled:opacity-40">
              <Plus size={16} /> Seçenek ekle
            </button>
          </div>
        </div>

        <div className="shrink-0 border-t px-4 py-3 md:px-6 md:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
          {error && <p className="text-sm font-bold text-red-600" role="alert">{error}</p>}
          <button type="button" onClick={() => void save()} disabled={busy}
            className="w-full min-h-12 rounded-2xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-60">
            {busy ? busyLabel : "Grubu kaydet"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
