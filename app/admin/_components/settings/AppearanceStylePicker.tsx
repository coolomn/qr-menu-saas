"use client";

import { APPEARANCE_REGISTRY } from "@/lib/public-menu/themes/registry";
import { THEME_IDS, type ThemeId } from "@/lib/public-menu/themes/ids";
import { THEME_ID_DESCRIPTIONS, THEME_ID_LABELS } from "@/lib/public-menu/themes/normalize";

type AppearanceStylePickerProps = {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
};

function AppearanceSwatch({ appearance }: { appearance: ThemeId }) {
  const s = APPEARANCE_REGISTRY[appearance];
  return (
    <div
      className={`rounded-lg overflow-hidden border border-black/5 h-14 ${s.pageRoot.replace(/min-h-screen|pb-\d+/g, "").trim()}`}
      aria-hidden
    >
      <div className={`h-4 ${s.header.split(" ").find((c) => c.startsWith("bg-")) ?? "bg-white"}`} />
      <div className="p-1.5 flex gap-1">
        <div className={`flex-1 h-6 rounded-md ${s.productCard.split(" ").find((c) => c.startsWith("bg-")) ?? "bg-white"} border ${s.productCard.includes("border-amber") ? "border-amber-200" : s.productCard.includes("border-zinc") ? "border-zinc-700" : "border-gray-100"}`} />
        <div className={`w-5 h-6 rounded-md ${s.categoryTabInactive.split(" ").find((c) => c.startsWith("bg-")) ?? "bg-gray-100"}`} />
      </div>
    </div>
  );
}

export function AppearanceStylePicker({ value, onChange }: AppearanceStylePickerProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {THEME_IDS.map((id) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`text-left rounded-xl border-2 p-2.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${
              selected
                ? "border-violet-500 bg-white shadow-sm ring-2 ring-violet-100"
                : "border-gray-200 bg-white/80 hover:border-violet-200"
            }`}
          >
            <AppearanceSwatch appearance={id} />
            <p className="mt-2 text-xs font-black text-gray-900">{THEME_ID_LABELS[id]}</p>
            <p className="text-[9px] font-medium text-gray-500 leading-snug line-clamp-2">
              {THEME_ID_DESCRIPTIONS[id]}
            </p>
          </button>
        );
      })}
    </div>
  );
}
