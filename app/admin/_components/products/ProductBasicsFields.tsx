"use client";

import { PRODUCT_BADGES, type ProductBadgeId } from "@/lib/public-menu/venue-info";

export type ProductBasicsValue = {
  is_sold_out: boolean;
  badges: string[];
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type Props = {
  value: ProductBasicsValue;
  onChange: (patch: Partial<ProductBasicsValue>) => void;
};

const numberInput =
  "w-full border-2 border-gray-100 bg-gray-50 p-3 rounded-xl font-bold text-gray-900 outline-none text-sm focus:border-blue-300";

export function ProductBasicsFields({ value, onChange }: Props) {
  const toggleBadge = (id: ProductBadgeId) => {
    const next = value.badges.includes(id) ? value.badges.filter((b) => b !== id) : [...value.badges, id];
    onChange({ badges: next });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-gray-50/80 p-3 cursor-pointer">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-gray-300"
          checked={value.is_sold_out}
          onChange={(e) => onChange({ is_sold_out: e.target.checked })}
        />
        <span className="text-xs font-black text-gray-800 uppercase">
          Tükendi
          <span className="block text-[10px] font-bold normal-case text-gray-400">
            Ürün menüde görünür ama “Tükendi” etiketiyle soluk gösterilir.
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <span className="text-[10px] font-black text-gray-400 uppercase ml-2">Rozetler</span>
        <div className="flex flex-wrap gap-1.5 md:gap-2">
          {PRODUCT_BADGES.map((badge) => (
            <button
              key={badge.id}
              type="button"
              onClick={() => toggleBadge(badge.id)}
              className={`min-h-11 px-3 py-2 rounded-xl text-[11px] md:text-xs font-bold flex items-center gap-1.5 transition-all ${
                value.badges.includes(badge.id)
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <span aria-hidden>{badge.icon}</span> {badge.tr}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-black text-gray-400 uppercase ml-2">Besin değerleri (isteğe bağlı)</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="text-[10px] font-bold text-gray-500">
            Kalori (kcal)
            <input
              type="text"
              inputMode="numeric"
              className={numberInput}
              value={value.calories}
              onChange={(e) => onChange({ calories: e.target.value })}
            />
          </label>
          <label className="text-[10px] font-bold text-gray-500">
            Protein (g)
            <input
              type="text"
              inputMode="decimal"
              className={numberInput}
              value={value.protein_g}
              onChange={(e) => onChange({ protein_g: e.target.value })}
            />
          </label>
          <label className="text-[10px] font-bold text-gray-500">
            Karbonhidrat (g)
            <input
              type="text"
              inputMode="decimal"
              className={numberInput}
              value={value.carbs_g}
              onChange={(e) => onChange({ carbs_g: e.target.value })}
            />
          </label>
          <label className="text-[10px] font-bold text-gray-500">
            Yağ (g)
            <input
              type="text"
              inputMode="decimal"
              className={numberInput}
              value={value.fat_g}
              onChange={(e) => onChange({ fat_g: e.target.value })}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
