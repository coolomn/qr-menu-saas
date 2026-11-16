/**
 * Faz 2.5b: Çeviri merkezi — menüdeki tüm çevrilebilir metinleri tek listeye çevirir (saf).
 *
 * Paylaşılan metinler tek satırdır:
 *   - Ana grup ("YİYECEKLER"): aynı ana grubu taşıyan tüm kategoriler birlikte güncellenir.
 *   - Çıkarılabilir malzeme ("Soğan"): aynı malzemeyi içeren tüm ürünler birlikte güncellenir.
 */
import type { TranslationLanguage } from "@/lib/i18n/languages";
import type { TranslationMap } from "@/lib/i18n/translations";
import type { TranslatableKind } from "@/lib/i18n/translatable";
import {
  firstFilledTranslations,
  missingTranslationFields,
  pickTranslationFields,
  translationsFromRow,
} from "@/lib/i18n/edit-translations";
import { parseRemovableIngredients } from "@/lib/public-menu/product-extras";
import { ingredientTranslations } from "@/lib/admin-menu/modifiers";

export type CenterEntryType = "product" | "variant" | "category" | "main_group" | "menu" | "modifier_group" | "modifier_option" | "ingredient";

export const CENTER_TYPE_LABELS: Record<CenterEntryType, string> = {
  product: "Ürün",
  variant: "Porsiyon / boy",
  category: "Kategori",
  main_group: "Ana grup",
  menu: "Menü",
  modifier_group: "Seçenek grubu",
  modifier_option: "Seçenek",
  ingredient: "Malzeme",
};

export type CenterEntry = {
  /** Benzersiz anahtar; AI istek kimliği olarak da kullanılır. */
  key: string;
  type: CenterEntryType;
  kind: TranslatableKind;
  /** Satırın bağlamı (ürünün kategorisi, varyantın ürünü…). */
  context: string | null;
  /** Türkçe kaynak (yalnız dolu alanlar çevrilir). */
  source: Record<string, string>;
  translations: TranslationMap;
  /** Kayıt hedefi kimlikleri (ana grup / malzemede birden çok satır). */
  targetIds: string[];
};

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function mainGroupKey(mainGroup: string): string {
  return `main_group:${mainGroup.trim().toLocaleUpperCase("tr-TR")}`;
}

export function ingredientKey(name: string): string {
  return `ingredient:${name.trim().toLocaleLowerCase("tr-TR")}`;
}

export type CenterSourceData = {
  products: Row[];
  /** product_id → varyant satırları */
  variantsByProduct: Record<string, Row[]>;
  categories: Row[];
  menus: Row[];
  /** listModifierGroups biçimi: { id, name, translations, options: [{ id, name, translations }] } */
  modifierGroups: { id?: string; name: string; translations: TranslationMap; options: { id?: string; name: string; translations: TranslationMap }[] }[];
};

export function buildCenterEntries(data: CenterSourceData): CenterEntry[] {
  const entries: CenterEntry[] = [];
  const categoryName = new Map(data.categories.map((c) => [str(c.id), str(c.name)]));

  // Menüler
  for (const m of data.menus) {
    entries.push({
      key: `menu:${str(m.id)}`,
      type: "menu",
      kind: "menu",
      context: null,
      source: { name: str(m.name), description: str(m.description) },
      translations: pickTranslationFields(translationsFromRow(m, ["name", "description"]), ["name", "description"]),
      targetIds: [str(m.id)],
    });
  }

  // Ana gruplar (paylaşılan)
  const groups = new Map<string, { text: string; ids: string[]; maps: TranslationMap[] }>();
  for (const c of data.categories) {
    const text = str(c.main_group).trim();
    if (!text) continue;
    const key = mainGroupKey(text);
    const g = groups.get(key) ?? { text, ids: [], maps: [] };
    g.ids.push(str(c.id));
    g.maps.push(pickTranslationFields(translationsFromRow(c, ["main_group"]), ["main_group"]));
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    entries.push({
      key,
      type: "main_group",
      kind: "category",
      context: null,
      source: { main_group: g.text },
      translations: firstFilledTranslations(g.maps),
      targetIds: g.ids,
    });
  }

  // Kategoriler (ad + not; ana grup ayrı satırda)
  for (const c of data.categories) {
    const parent = str(c.parent_id);
    entries.push({
      key: `category:${str(c.id)}`,
      type: "category",
      kind: "category",
      context: parent ? categoryName.get(parent) || null : str(c.main_group) || null,
      source: { name: str(c.name), note: str(c.note) },
      translations: pickTranslationFields(translationsFromRow(c, ["name", "main_group", "note"]), ["name", "note"]),
      targetIds: [str(c.id)],
    });
  }

  // Ürünler + varyantlar + malzemeler
  const ingredients = new Map<string, { text: string; productIds: string[]; maps: TranslationMap[] }>();
  for (const p of data.products) {
    const id = str(p.id);
    entries.push({
      key: `product:${id}`,
      type: "product",
      kind: "product",
      context: categoryName.get(str(p.category_id)) || null,
      source: { name: str(p.name), description: str(p.description) },
      translations: translationsFromRow(p, ["name", "description"]),
      targetIds: [id],
    });
    for (const v of data.variantsByProduct[id] ?? []) {
      entries.push({
        key: `variant:${str(v.id)}`,
        type: "variant",
        kind: "variant",
        context: str(p.name) || null,
        source: { label: str(v.label) },
        translations: translationsFromRow(v, ["label"]),
        targetIds: [str(v.id)],
      });
    }
    for (const item of parseRemovableIngredients(p.removable_ingredients)) {
      const key = ingredientKey(item.name);
      const g = ingredients.get(key) ?? { text: item.name, productIds: [], maps: [] };
      if (!g.productIds.includes(id)) g.productIds.push(id);
      g.maps.push(ingredientTranslations(item));
      ingredients.set(key, g);
    }
  }
  for (const [key, g] of ingredients) {
    entries.push({
      key,
      type: "ingredient",
      kind: "ingredient",
      context: g.productIds.length > 1 ? `${g.productIds.length} üründe` : null,
      source: { name: g.text },
      translations: firstFilledTranslations(g.maps),
      targetIds: g.productIds,
    });
  }

  // Seçenek grupları
  for (const group of data.modifierGroups) {
    if (!group.id) continue;
    entries.push({
      key: `modifier_group:${group.id}`,
      type: "modifier_group",
      kind: "modifier_group",
      context: null,
      source: { name: group.name },
      translations: group.translations,
      targetIds: [group.id],
    });
    for (const option of group.options) {
      if (!option.id) continue;
      entries.push({
        key: `modifier_option:${option.id}`,
        type: "modifier_option",
        kind: "modifier_option",
        context: group.name,
        source: { name: option.name },
        translations: option.translations,
        targetIds: [option.id],
      });
    }
  }

  // Boş kaynaklı alanları at; hiç metni olmayan satırı gösterme.
  return entries
    .map((e) => ({
      ...e,
      source: Object.fromEntries(Object.entries(e.source).filter(([, t]) => t.trim())),
    }))
    .filter((e) => Object.keys(e.source).length > 0);
}

export type LanguageCoverage = { filled: number; total: number; percent: number };

/** Bir dilde çevrilmiş alan oranı. */
export function languageCoverage(
  entries: readonly CenterEntry[],
  language: TranslationLanguage,
  translationsOf: (entry: CenterEntry) => TranslationMap = (e) => e.translations
): LanguageCoverage {
  let total = 0;
  let missing = 0;
  for (const entry of entries) {
    total += Object.keys(entry.source).length;
    missing += missingTranslationFields(entry.source, translationsOf(entry), language).length;
  }
  const filled = total - missing;
  return { filled, total, percent: total === 0 ? 100 : Math.floor((filled / total) * 100) };
}
