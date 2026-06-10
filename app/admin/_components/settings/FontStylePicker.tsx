"use client";

import { FONT_STYLE_IDS, type FontStyleId } from "@/lib/public-menu/themes/font-ids";
import { FONT_REGISTRY } from "@/lib/public-menu/themes/font-registry";
import { resolvePriceTypography } from "@/lib/public-menu/themes/price-typography";
import {
  FONT_STYLE_DESCRIPTIONS,
  FONT_STYLE_LABELS,
} from "@/lib/public-menu/themes/font-normalize";

type FontStylePickerProps = {
  value: FontStyleId;
  onChange: (id: FontStyleId) => void;
};

export function FontStylePicker({ value, onChange }: FontStylePickerProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {FONT_STYLE_IDS.map((id) => {
        const selected = value === id;
        const fonts = FONT_REGISTRY[id];
        const priceTypo = resolvePriceTypography(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`text-left rounded-xl border-2 p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
              selected
                ? "border-indigo-500 bg-white shadow-sm ring-2 ring-indigo-100"
                : "border-gray-200 bg-white/80 hover:border-indigo-200"
            }`}
          >
            <div className={`rounded-lg bg-gray-50 border border-gray-100 p-2.5 mb-2 ${fonts.body}`}>
              <p className={`${fonts.heading} text-sm font-bold text-gray-900 leading-tight`}>
                Menü Başlığı
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Ürün açıklaması</p>
              <p className={`mt-1 ${priceTypo.product}`} style={{ color: "#57534e" }}>
                ₺420
              </p>
            </div>
            <p className="text-xs font-black text-gray-900">{FONT_STYLE_LABELS[id]}</p>
            <p className="text-[9px] font-medium text-gray-500">{FONT_STYLE_DESCRIPTIONS[id]}</p>
          </button>
        );
      })}
    </div>
  );
}
