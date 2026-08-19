"use client";

import { useEffect } from "react";
import { Loader2, X } from "lucide-react";
import type { AdminMenuCollectionListItem } from "@/lib/admin-menu/types";

export type MenuCollectionFormValues = {
  name: string;
  name_en: string;
  name_ru: string;
  description: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export function emptyMenuCollectionForm(): MenuCollectionFormValues {
  return {
    name: "",
    name_en: "",
    name_ru: "",
    description: "",
    start_time: "",
    end_time: "",
    is_active: true,
  };
}

export function formValuesFromItem(item: AdminMenuCollectionListItem): MenuCollectionFormValues {
  return {
    name: item.name,
    name_en: item.name_en || "",
    name_ru: item.name_ru || "",
    description: item.description || "",
    start_time: toTimeInput(item.start_time),
    end_time: toTimeInput(item.end_time),
    is_active: item.is_active,
  };
}

function toTimeInput(value: string | null): string {
  if (!value) return "";
  return value.length >= 5 ? value.slice(0, 5) : value;
}

type MenuCollectionFormModalProps = {
  open: boolean;
  title: string;
  values: MenuCollectionFormValues;
  busy: boolean;
  error: string | null;
  onChange: (values: MenuCollectionFormValues) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function MenuCollectionFormModal({
  open,
  title,
  values,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
}: MenuCollectionFormModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.classList.add("admin-modal-open");
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("admin-modal-open");
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const set = (patch: Partial<MenuCollectionFormValues>) => onChange({ ...values, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center overflow-hidden pt-[max(0.75rem,env(safe-area-inset-top))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] md:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Kapat"
        onClick={() => !busy && onClose()}
      />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col min-h-0 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.75rem)] md:max-h-[90dvh] overflow-hidden">
        <div className="shrink-0 bg-white border-b border-gray-100 px-5 py-3 md:py-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-gray-900 min-w-0 truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-xl text-gray-400 hover:bg-gray-100 disabled:opacity-40"
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </div>

        <form
          className="flex flex-col flex-1 min-h-0"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-5 space-y-4">
          {error && (
            <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Menü adı (TR) *
            </span>
            <input
              required
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              className="mt-1 w-full max-w-full min-w-0 min-h-11 border-2 border-gray-100 rounded-xl px-4 py-3 font-bold text-gray-900 outline-none focus:border-blue-500"
              placeholder="Örn. Akşam Menüsü"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">EN</span>
              <input
                value={values.name_en}
                onChange={(e) => set({ name_en: e.target.value })}
                className="mt-1 w-full max-w-full min-w-0 min-h-11 border-2 border-gray-100 rounded-xl px-4 py-3 font-medium outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">RU</span>
              <input
                value={values.name_ru}
                onChange={(e) => set({ name_ru: e.target.value })}
                className="mt-1 w-full max-w-full min-w-0 min-h-11 border-2 border-gray-100 rounded-xl px-4 py-3 font-medium outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
              Açıklama
            </span>
            <textarea
              value={values.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              className="mt-1 w-full max-w-full min-w-0 min-h-11 box-border resize-y border-2 border-gray-100 rounded-xl px-4 py-3 font-medium outline-none focus:border-blue-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Başlangıç
              </span>
              <input
                type="time"
                value={values.start_time}
                onChange={(e) => set({ start_time: e.target.value })}
                className="mt-1 w-full max-w-full min-w-0 min-h-11 border-2 border-gray-100 rounded-xl px-4 py-3 font-medium outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Bitiş</span>
              <input
                type="time"
                value={values.end_time}
                onChange={(e) => set({ end_time: e.target.value })}
                className="mt-1 w-full max-w-full min-w-0 min-h-11 border-2 border-gray-100 rounded-xl px-4 py-3 font-medium outline-none focus:border-blue-500"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 min-h-11 p-4 bg-gray-50 rounded-2xl border border-gray-100 cursor-pointer">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => set({ is_active: e.target.checked })}
              className="h-5 w-5 rounded border-gray-300"
            />
            <span className="text-sm font-bold text-gray-800">Müşteri menüsünde aktif</span>
          </label>

          </div>
          <div className="shrink-0 border-t border-gray-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-5">
          <button
            type="submit"
            disabled={busy}
            className="w-full min-h-11 bg-blue-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Kaydet
          </button>
          </div>
        </form>
      </div>
    </div>
  );
}
