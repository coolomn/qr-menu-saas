"use client";

import { useEffect, useRef } from "react";
import type { BulkMenuLinkCheckState } from "@/lib/admin-menu/bulk-product-menu-collections";

type MenuOption = { id: string; name: string };

type BulkProductMenuToolbarProps = {
  selectedCount: number;
  menus: MenuOption[];
  menuCheckStates: Record<string, BulkMenuLinkCheckState>;
  selectedMenuIds: string[];
  incompatibleMenuIds: string[];
  onToggleMenu: (menuId: string) => void;
  onAdd: () => void;
  onRemove: () => void;
  busy: boolean;
  error: string | null;
  success: string | null;
};

function linkStateLabel(state: BulkMenuLinkCheckState): string {
  if (state === "all") return "Tümü bağlı";
  if (state === "some") return "Kısmen bağlı";
  return "Bağlı değil";
}

function MenuActionCheckbox({
  menuId,
  name,
  linkState,
  selected,
  categoryWarning,
  onToggle,
}: {
  menuId: string;
  name: string;
  linkState: BulkMenuLinkCheckState;
  selected: boolean;
  categoryWarning: boolean;
  onToggle: (menuId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showIndeterminate = !selected && linkState === "some";

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = showIndeterminate;
    }
  }, [showIndeterminate]);

  return (
    <button
      type="button"
      onClick={() => onToggle(menuId)}
      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left w-full ${
        selected
          ? "bg-teal-50 border-teal-400"
          : linkState === "all"
            ? "bg-white border-teal-200"
            : linkState === "some"
              ? "bg-amber-50/80 border-amber-200"
              : "bg-gray-50 border-gray-100"
      }`}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={selected}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="h-4 w-4 rounded border-teal-300 pointer-events-none"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-gray-800">{name}</span>
        <span className="block text-[10px] font-semibold text-gray-500">{linkStateLabel(linkState)}</span>
        {categoryWarning && (
          <span className="block text-[10px] font-semibold text-amber-700 mt-0.5">
            Bazı seçili ürünlerin kategorileri bu menüye bağlı değil
          </span>
        )}
      </span>
    </button>
  );
}

export function BulkProductMenuToolbar({
  selectedCount,
  menus,
  menuCheckStates,
  selectedMenuIds,
  incompatibleMenuIds,
  onToggleMenu,
  onAdd,
  onRemove,
  busy,
  error,
  success,
}: BulkProductMenuToolbarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="sticky bottom-3 md:bottom-auto md:top-2 z-20 mx-3 md:mx-0 rounded-2xl border border-teal-200 bg-white/95 shadow-lg backdrop-blur p-3 md:p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm font-black text-gray-900">{selectedCount} ürün seçildi</p>
        <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">
          Menü görünürlüğü
        </p>
      </div>
      <p className="text-[11px] text-gray-500 font-medium leading-snug">
        Durum yazısı seçili ürünlerin mevcut bağlantısını gösterir. İşlem yapmak istediğiniz menüyü
        işaretleyip ekleyin veya çıkarın.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
        {menus.map((menu) => (
          <MenuActionCheckbox
            key={menu.id}
            menuId={menu.id}
            name={menu.name}
            linkState={menuCheckStates[menu.id] || "none"}
            selected={selectedMenuIds.includes(menu.id)}
            categoryWarning={incompatibleMenuIds.includes(menu.id)}
            onToggle={onToggleMenu}
          />
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={busy || selectedMenuIds.length === 0}
          className="flex-1 px-3 py-2.5 rounded-xl text-sm font-black bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Seçili menülere ekle
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy || selectedMenuIds.length === 0}
          className="flex-1 px-3 py-2.5 rounded-xl text-sm font-black border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Seçili menülerden çıkar
        </button>
      </div>
      {success && (
        <p className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
          {success}
        </p>
      )}
      {error && (
        <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-line">
          {error}
        </p>
      )}
    </div>
  );
}
