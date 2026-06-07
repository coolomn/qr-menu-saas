"use client";

import { useState } from "react";
import { Layers, X } from "lucide-react";
import {
  VARIANT_TEMPLATE_PRESETS,
  type VariantTemplatePresetId,
  parseCustomVariantLabels,
} from "@/lib/menu-import/variant-templates";

type ImportVariantTemplatePanelProps = {
  productCount: number;
  productsWithVariants: number;
  onApply: (labels: string[]) => void;
  onClose: () => void;
};

export function ImportVariantTemplatePanel({
  productCount,
  productsWithVariants,
  onApply,
  onClose,
}: ImportVariantTemplatePanelProps) {
  const [customLabels, setCustomLabels] = useState("");

  const applyPreset = (presetId: VariantTemplatePresetId) => {
    onApply([...VARIANT_TEMPLATE_PRESETS[presetId].labels]);
  };

  const applyCustom = () => {
    const labels = parseCustomVariantLabels(customLabels);
    if (labels.length === 0) return;
    onApply(labels);
  };

  return (
    <div className="border-b border-violet-100 bg-violet-50/60 px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Layers className="shrink-0 mt-0.5 text-violet-600" size={18} />
          <div>
            <p className="text-sm font-black text-violet-900">Varyant şablonu uygula</p>
            <p className="text-xs text-violet-800/90 mt-1 leading-relaxed">
              Bu kategorideki {productCount} ürüne aynı varyant etiketlerini ekler. Fiyatlar boş
              kalır; sonra tek tek doldurabilirsiniz.
            </p>
            {productsWithVariants > 0 && (
              <p className="text-xs font-bold text-amber-800 mt-2">
                {productsWithVariants} üründe zaten varyant var — varsayılan olarak yalnızca boş
                olanlara uygulanır.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-lg text-violet-600 hover:bg-violet-100"
          title="Kapat"
          aria-label="Kapat"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(VARIANT_TEMPLATE_PRESETS) as VariantTemplatePresetId[]).map((presetId) => {
          const preset = VARIANT_TEMPLATE_PRESETS[presetId];
          return (
            <button
              key={presetId}
              type="button"
              onClick={() => applyPreset(presetId)}
              className="px-3 py-2 rounded-xl border border-violet-200 bg-white text-xs font-bold text-violet-900 hover:bg-violet-100 transition-colors"
            >
              {preset.label}: {preset.labels.join(", ")}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={customLabels}
          onChange={(e) => setCustomLabels(e.target.value)}
          placeholder="Özel etiketler (virgülle): 20 CL, 35 CL, 50 CL"
          className="flex-1 border-2 border-violet-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-violet-400 bg-white"
        />
        <button
          type="button"
          onClick={applyCustom}
          disabled={parseCustomVariantLabels(customLabels).length === 0}
          className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-black hover:bg-violet-700 disabled:opacity-50"
        >
          Özel uygula
        </button>
      </div>
    </div>
  );
}
