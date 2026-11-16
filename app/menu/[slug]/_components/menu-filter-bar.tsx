"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";
import {
  lightboxCardClasses,
  lightboxCloseButtonClasses,
} from "@/app/menu/[slug]/_components/ProductImageLightbox";
import { resolveAllergen } from "@/lib/public-menu/allergens";
import {
  activeFilterCount,
  DIET_FILTERS,
  EMPTY_MENU_FILTER,
  MENU_SORTS,
  type DietFilterId,
  type MenuFilterState,
  type MenuSort,
} from "@/lib/public-menu/menu-filters";
import type { ResolvedMenuPresentation } from "@/lib/public-menu/themes/resolve";
import { pickLang, type LocalizedString } from "@/lib/i18n/languages";
import { CurrencyNote, CurrencySelect } from "@/app/menu/[slug]/_components/menu-currency";
import type { CurrencyCode, PublicCurrencyRate } from "@/lib/currency/currencies";

const SORT_LABELS: Record<MenuSort, LocalizedString> = {
  default: { tr: "Önerilen sıra", en: "Recommended", ru: "Рекомендуемые", de: "Empfohlen", fr: "Recommandé", es: "Recomendado", it: "Consigliati", uk: "Рекомендовані", zh: "推荐排序", az: "Tövsiyə olunan" },
  price_asc: { tr: "Fiyat: artan", en: "Price: low to high", ru: "Цена: по возрастанию", de: "Preis: aufsteigend", fr: "Prix : croissant", es: "Precio: de menor a mayor", it: "Prezzo: crescente", uk: "Ціна: за зростанням", zh: "价格：从低到高", az: "Qiymət: artan" },
  price_desc: { tr: "Fiyat: azalan", en: "Price: high to low", ru: "Цена: по убыванию", de: "Preis: absteigend", fr: "Prix : décroissant", es: "Precio: de mayor a menor", it: "Prezzo: decrescente", uk: "Ціна: за спаданням", zh: "价格：从高到低", az: "Qiymət: azalan" },
  name: { tr: "Ada göre (A-Z)", en: "Name (A-Z)", ru: "По названию (А-Я)", de: "Name (A-Z)", fr: "Nom (A-Z)", es: "Nombre (A-Z)", it: "Nome (A-Z)", uk: "За назвою (А-Я)", zh: "按名称排序", az: "Ada görə (A-Z)" },
};

type MenuFilterBarProps = {
  value: MenuFilterState;
  onChange: (next: MenuFilterState) => void;
  options: { allergens: string[]; diets: DietFilterId[] };
  theme: ResolvedMenuPresentation;
  language: string;
  /** Faz 2.5c: döviz seçici (işletme döviz açmadıysa rates boş → görünmez). */
  currency?: {
    rates: PublicCurrencyRate[];
    value: PublicCurrencyRate | null;
    onChange: (next: CurrencyCode | "TRY") => void;
  };
};

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function MenuFilterBar({ value, onChange, options, theme, language, currency }: MenuFilterBarProps) {
  const [open, setOpen] = useState(false);
  const appearance = theme.appearance;
  const chipBase = lightboxCloseButtonClasses(appearance);
  const count = activeFilterCount(value);
  const hasFilterOptions = options.allergens.length > 0 || options.diets.length > 0;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeChip = (on: boolean) =>
    on ? "border-transparent text-white" : chipBase;
  const activeStyle = (on: boolean) => (on ? { backgroundColor: theme.tabActiveColor } : undefined);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {hasFilterOptions && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${activeChip(count > 0)}`}
            style={activeStyle(count > 0)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={14} aria-hidden />
            {pickLang(language, { tr: "Filtrele", en: "Filter", ru: "Фильтр", de: "Filtern", fr: "Filtrer", es: "Filtrar", it: "Filtra", uk: "Фільтр", zh: "筛选", az: "Filtrlə" })}
            {count > 0 ? ` (${count})` : ""}
          </button>
        )}
        <label className="sr-only" htmlFor="menu-sort">
          {pickLang(language, { tr: "Sırala", en: "Sort", ru: "Сортировка", de: "Sortieren", fr: "Trier", es: "Ordenar", it: "Ordina", uk: "Сортування", zh: "排序", az: "Sırala" })}
        </label>
        <select
          id="menu-sort"
          value={value.sort}
          onChange={(e) => onChange({ ...value, sort: e.target.value as MenuSort })}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${chipBase}`}
        >
          {MENU_SORTS.map((s) => (
            <option key={s} value={s}>
              {pickLang(language, SORT_LABELS[s])}
            </option>
          ))}
        </select>
        {currency ? (
          <CurrencySelect
            rates={currency.rates}
            value={currency.value}
            onChange={currency.onChange}
            language={language}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${activeChip(currency.value !== null)}`}
            style={activeStyle(currency.value !== null)}
          />
        ) : null}
      </div>
      <CurrencyNote className="mt-2" />

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={pickLang(language, { tr: "Filtreler", en: "Filters", ru: "Фильтры", de: "Filter", fr: "Filtres", es: "Filtros", it: "Filtri", uk: "Фільтри", zh: "筛选", az: "Filtrlər" })}
            onClick={() => setOpen(false)}
          >
            <div
              className={`max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl ${lightboxCardClasses(appearance)}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black">
                  {pickLang(language, { tr: "Filtreler", en: "Filters", ru: "Фильтры", de: "Filter", fr: "Filtres", es: "Filtros", it: "Filtri", uk: "Фільтри", zh: "筛选", az: "Filtrlər" })}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border ${chipBase}`}
                  aria-label={pickLang(language, { tr: "Kapat", en: "Close", ru: "Закрыть", de: "Schließen", fr: "Fermer", es: "Cerrar", it: "Chiudi", uk: "Закрити", zh: "关闭", az: "Bağla" })}
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              {options.diets.length > 0 && (
                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide opacity-70">
                    {pickLang(language, { tr: "Tercih", en: "Preference", ru: "Предпочтения", de: "Präferenz", fr: "Préférence", es: "Preferencia", it: "Preferenza", uk: "Уподобання", zh: "偏好", az: "Seçim" })}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {DIET_FILTERS.filter((d) => options.diets.includes(d.id)).map((d) => {
                      const on = value.diets.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onChange({ ...value, diets: toggle(value.diets, d.id) })}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${activeChip(on)}`}
                          style={activeStyle(on)}
                        >
                          <span aria-hidden>{d.icon}</span> {pickLang(language, d)}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {options.allergens.length > 0 && (
                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wide opacity-70">
                    {pickLang(language, {
                      tr: "Bunları içermesin",
                      en: "Exclude allergens",
                      ru: "Исключить аллергены",
                      de: "Allergene ausschließen",
                      fr: "Exclure les allergènes",
                      es: "Excluir alérgenos",
                      it: "Escludi allergeni",
                      uk: "Виключити алергени",
                      zh: "排除过敏原",
                      az: "Allergenləri çıxar",
                    })}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {options.allergens.map((id) => {
                      const a = resolveAllergen(id, language);
                      if (!a) return null;
                      const on = value.excludeAllergens.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            onChange({ ...value, excludeAllergens: toggle(value.excludeAllergens, id) })
                          }
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${activeChip(on)}`}
                          style={activeStyle(on)}
                        >
                          <span aria-hidden>{a.icon}</span> {a.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[11px] leading-snug opacity-70">
                    {pickLang(language, {
                      tr: "Alerjen bilgisi işletme tarafından girilir. Ciddi alerjiniz varsa lütfen personele danışın.",
                      en: "Allergen info is provided by the venue. If you have a serious allergy, please ask the staff.",
                      ru: "Информацию об аллергенах указывает заведение. При серьёзной аллергии уточните у персонала.",
                      de: "Allergeninformationen werden vom Betrieb angegeben. Bei schweren Allergien wenden Sie sich bitte an das Personal.",
                      fr: "Les informations sur les allergènes sont fournies par l'établissement. En cas d'allergie grave, veuillez demander au personnel.",
                      es: "La información sobre alérgenos la proporciona el establecimiento. Si tiene una alergia grave, consulte al personal.",
                      it: "Le informazioni sugli allergeni sono fornite dal locale. In caso di allergie gravi, chiedi al personale.",
                      uk: "Інформацію про алергени надає заклад. Якщо у вас серйозна алергія, зверніться до персоналу.",
                      zh: "过敏原信息由商家提供。如有严重过敏，请咨询工作人员。",
                      az: "Allergen məlumatını müəssisə daxil edir. Ciddi allergiyanız varsa, işçilərə müraciət edin.",
                    })}
                  </p>
                </section>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...EMPTY_MENU_FILTER, sort: value.sort })}
                  className={`flex-1 rounded-full border px-4 py-2.5 text-sm font-bold ${chipBase}`}
                >
                  {pickLang(language, { tr: "Temizle", en: "Clear", ru: "Сбросить", de: "Zurücksetzen", fr: "Effacer", es: "Borrar", it: "Cancella", uk: "Скинути", zh: "清除", az: "Təmizlə" })}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white"
                  style={{ backgroundColor: theme.tabActiveColor }}
                >
                  {pickLang(language, { tr: "Göster", en: "Show", ru: "Показать", de: "Anzeigen", fr: "Afficher", es: "Mostrar", it: "Mostra", uk: "Показати", zh: "显示", az: "Göstər" })}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
