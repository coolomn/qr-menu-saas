"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import {
  emptyModifierOption,
  saveModifierGroup,
  validateModifierGroup,
  type AdminModifierGroup,
  type AdminModifierOption,
} from "@/lib/admin-menu/modifiers";
import { MAX_OPTIONS_PER_GROUP } from "@/lib/public-menu/product-extras";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import { getTranslationField, setTranslationField } from "@/lib/i18n/edit-translations";
import { applyAiResults, entitiesTranslationStatus, type TranslatableEntity } from "@/lib/admin-menu/form-ai-translate";
import { TranslationSection, translationInputClass } from "@/app/admin/_components/i18n/TranslationTabs";
import { useFormAiTranslate } from "@/app/admin/_components/i18n/useFormAiTranslate";

const supabase = getBrowserSupabase();

type Props = {
  restaurantId: string;
  initial: AdminModifierGroup;
  /** Yeni grupta sıra (listenin sonu). */
  sortOrder: number;
  /** Menüde açık çeviri dilleri (TR hariç). */
  translationLanguages: readonly TranslationLanguage[];
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
export function ModifierGroupModal({ restaurantId, initial, sortOrder, translationLanguages, onClose, onSaved }: Props) {
  const [group, setGroup] = useState<AdminModifierGroup>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ai = useFormAiTranslate(restaurantId);

  // Seçenekler sıralanıp silinebildiği için AI anahtarı dizin değil, nesnenin kendisine bağlı.
  const translatableEntities = (): { entities: TranslatableEntity[]; options: AdminModifierOption[] } => {
    const options = group.options;
    const entities: TranslatableEntity[] = [
      { id: "group", kind: "modifier_group", source: { name: group.name }, translations: group.translations },
      ...options.map((o, i) => ({
        id: `option:${i}`,
        kind: "modifier_option" as const,
        source: { name: o.name },
        translations: o.translations,
      })),
    ];
    return { entities, options };
  };

  const statusFor = (lang: TranslationLanguage) => entitiesTranslationStatus(translatableEntities().entities, lang);

  const fillWithAi = () => {
    const { entities, options } = translatableEntities();
    void ai.run(entities, translationLanguages, (results) => {
      setGroup((g) => ({
        ...g,
        translations: applyAiResults(g.translations, results, "group"),
        options: g.options.map((o) => {
          const index = options.indexOf(o);
          return index >= 0 ? { ...o, translations: applyAiResults(o.translations, results, `option:${index}`) } : o;
        }),
      }));
    });
  };

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
    const res = await saveModifierGroup(supabase, restaurantId, group, sortOrder);
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
              seçenekler yalnızca bilgi olarak gösterilir.
            </p>
          </div>

          <div className="space-y-2">
            <span className={label}>Seçenekler</span>
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

          <TranslationSection
            languages={translationLanguages}
            statusFor={statusFor}
            onAiFill={fillWithAi}
            aiBusy={ai.busy}
            aiMessage={ai.message}
          >
            {(lang) => (
              <>
                <input
                  className={translationInputClass}
                  placeholder={group.name || "Grup adı"}
                  aria-label="Grup adı çevirisi"
                  maxLength={80}
                  value={getTranslationField(group.translations, lang, "name")}
                  onChange={(e) =>
                    setGroup((g) => ({ ...g, translations: setTranslationField(g.translations, lang, "name", e.target.value) }))
                  }
                />
                {group.options.map((option, index) =>
                  option.name.trim() ? (
                    <input
                      key={option.id ?? `tr-${index}`}
                      className={`${translationInputClass} font-medium`}
                      placeholder={option.name}
                      aria-label={`${option.name} çevirisi`}
                      maxLength={80}
                      value={getTranslationField(option.translations, lang, "name")}
                      onChange={(e) =>
                        patchOption(index, {
                          translations: setTranslationField(option.translations, lang, "name", e.target.value),
                        })
                      }
                    />
                  ) : null
                )}
              </>
            )}
          </TranslationSection>
        </div>

        <div className="shrink-0 border-t px-4 py-3 md:px-6 md:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
          {error && <p className="text-sm font-bold text-red-600" role="alert">{error}</p>}
          <button type="button" onClick={() => void save()} disabled={busy || ai.busy}
            className="w-full min-h-12 rounded-2xl bg-blue-600 text-white font-black hover:bg-blue-700 disabled:opacity-60">
            {busy ? "Kaydediliyor…" : "Grubu kaydet"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
