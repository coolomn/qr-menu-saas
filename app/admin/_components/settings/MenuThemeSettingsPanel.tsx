"use client";

import { LayoutTemplate, Type } from "lucide-react";
import type { FontStyleId } from "@/lib/public-menu/themes/font-ids";
import type { ThemeId } from "@/lib/public-menu/themes/ids";
import { MENU_FONT_VARIABLE_CLASSES } from "@/lib/public-menu/themes/fonts";
import { AppearanceStylePicker } from "./AppearanceStylePicker";
import { FontStylePicker } from "./FontStylePicker";
import { MenuPresentationPreview } from "./MenuPresentationPreview";

type MenuThemeSettingsPanelProps = {
  themeId: ThemeId;
  fontStyleId: FontStyleId;
  primaryColor: string;
  restaurantName: string;
  logoUrl: string | null;
  onThemeChange: (id: ThemeId) => void;
  onFontChange: (id: FontStyleId) => void;
};

export function MenuThemeSettingsPanel({
  themeId,
  fontStyleId,
  primaryColor,
  restaurantName,
  logoUrl,
  onThemeChange,
  onFontChange,
}: MenuThemeSettingsPanelProps) {
  return (
    <div className={`p-4 md:p-6 border-2 border-violet-100 rounded-3xl bg-violet-50/30 space-y-6 ${MENU_FONT_VARIABLE_CLASSES}`}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate size={18} className="text-violet-600" />
          <label className="text-xs md:text-sm font-black text-violet-900 uppercase">
            Menü görünümü
          </label>
        </div>
        <p className="text-[10px] md:text-xs font-bold text-gray-500">
          Arka plan, kartlar ve genel renk paleti. Yazı tipinden bağımsız seçilir.
        </p>
        <AppearanceStylePicker value={themeId} onChange={onThemeChange} />
      </div>

      <div className="space-y-3 border-t border-violet-100 pt-5">
        <div className="flex items-center gap-2">
          <Type size={18} className="text-indigo-600" />
          <label className="text-xs md:text-sm font-black text-indigo-900 uppercase">
            Yazı stili
          </label>
        </div>
        <p className="text-[10px] md:text-xs font-bold text-gray-500">
          Başlık ve gövde tipografisi. Görünümden bağımsız seçilir.
        </p>
        <FontStylePicker value={fontStyleId} onChange={onFontChange} />
      </div>

      <div className="space-y-3 border-t border-violet-100 pt-5">
        <label className="text-xs md:text-sm font-black text-gray-900 uppercase">
          Canlı önizleme
        </label>
        <p className="text-[10px] md:text-xs font-bold text-gray-500">
          Seçili görünüm, yazı stili ve marka renginin birleşik önizlemesi.
        </p>
        <MenuPresentationPreview
          appearance={themeId}
          font={fontStyleId}
          primaryColor={primaryColor}
          restaurantName={restaurantName}
          logoUrl={logoUrl}
        />
      </div>
    </div>
  );
}
