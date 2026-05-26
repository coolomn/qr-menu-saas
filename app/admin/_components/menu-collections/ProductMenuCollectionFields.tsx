"use client";

import type { CategoryMenuCollectionsPickerMenu } from "@/lib/admin-menu/types";

type ProductMenuCollectionFieldsProps = {
  menus: CategoryMenuCollectionsPickerMenu[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  error: string | null;
};

export function ProductMenuCollectionFields({
  menus,
  selectedIds,
  onChange,
  error,
}: ProductMenuCollectionFieldsProps) {
  const toggle = (menuId: string) => {
    if (selectedIds.includes(menuId)) {
      onChange(selectedIds.filter((id) => id !== menuId));
    } else {
      onChange([...selectedIds, menuId]);
    }
  };

  if (menus.length === 0) {
    return (
      <div className="p-4 md:p-5 bg-amber-50 rounded-2xl border border-amber-100">
        <p className="text-xs font-bold text-amber-900 leading-relaxed">
          Bu kategori için seçilebilir menü yok. Önce kategoriye menü bağlayın veya Menüler sekmesinden
          aktif menü oluşturun.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 bg-teal-50 rounded-2xl border border-teal-100 space-y-3">
      <div>
        <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest">
          Menü görünürlüğü
        </p>
        <p className="text-xs text-teal-900/80 font-medium mt-1 leading-relaxed">
          Bu ürün hangi menülerde görünsün? Seçenekler, ürünün kategorisinin bağlı olduğu menülerle
          sınırlıdır. En az bir menü seçin.
        </p>
      </div>

      {error && (
        <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {menus.map((menu) => {
          const checked = selectedIds.includes(menu.id);
          return (
            <label
              key={menu.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                checked
                  ? "bg-white border-teal-300 shadow-sm"
                  : "bg-teal-50/50 border-teal-100 hover:bg-white"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(menu.id)}
                className="h-4 w-4 rounded border-teal-300"
              />
              <span className="text-sm font-bold text-gray-800">{menu.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
