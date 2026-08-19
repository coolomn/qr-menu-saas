import type { SourceLanguage, TargetLanguage } from "@/lib/admin-menu/auto-translate";
import { planMissingLocalizedField } from "@/lib/admin-menu/auto-translate";

export const MENU_CATEGORY_TRANSLATE_CONTEXT = `This text is a restaurant menu category title.
Translate it naturally as a menu heading.
Do not translate literally when a standard restaurant term exists.
Return only the translated category title.`;

export type MenuCategoryTranslation = {
  en: string;
  ru: string;
};

export type MenuCategoryFallbackRequest = {
  text: string;
  sourceLanguage: SourceLanguage;
  targetLanguage: TargetLanguage;
  context: string;
};

type MenuCategoryDictionaryEntry = MenuCategoryTranslation & {
  aliases: string[];
};

const MENU_CATEGORY_DICTIONARY: MenuCategoryDictionaryEntry[] = [
  { aliases: ["tatlı", "tatlılar"], en: "Desserts", ru: "Десерты" },
  { aliases: ["içecek", "içecekler"], en: "Drinks", ru: "Напитки" },
  { aliases: ["alkolsüz içecekler", "alkolsüz içecek"], en: "Soft Drinks", ru: "Безалкогольные напитки" },
  { aliases: ["alkollü içecekler", "alkollü içecek"], en: "Alcoholic Drinks", ru: "Алкогольные напитки" },
  { aliases: ["sıcak içecekler", "sıcak içecek"], en: "Hot Drinks", ru: "Горячие напитки" },
  { aliases: ["soğuk içecekler", "soğuk içecek"], en: "Cold Drinks", ru: "Холодные напитки" },
  { aliases: ["kahvaltı"], en: "Breakfast", ru: "Завтрак" },
  { aliases: ["başlangıç", "başlangıçlar"], en: "Starters", ru: "Закуски" },
  { aliases: ["soğuk başlangıçlar", "soğuk başlangıç"], en: "Cold Starters", ru: "Холодные закуски" },
  { aliases: ["sıcak başlangıçlar", "sıcak başlangıç"], en: "Hot Starters", ru: "Горячие закуски" },
  { aliases: ["ara sıcak", "ara sıcaklar"], en: "Hot Appetizers", ru: "Горячие закуски" },
  { aliases: ["ana yemek", "ana yemekler"], en: "Main Courses", ru: "Основные блюда" },
  { aliases: ["salata", "salatalar"], en: "Salads", ru: "Салаты" },
  { aliases: ["çorba", "çorbalar"], en: "Soups", ru: "Супы" },
  { aliases: ["makarna", "makarnalar"], en: "Pasta", ru: "Паста" },
  { aliases: ["pizza", "pizzalar"], en: "Pizzas", ru: "Пицца" },
  { aliases: ["burger", "burgerler"], en: "Burgers", ru: "Бургеры" },
  { aliases: ["sandviç", "sandviçler", "sandwiches"], en: "Sandwiches", ru: "Сэндвичи" },
  { aliases: ["et yemekleri", "et yemeği"], en: "Meat Dishes", ru: "Мясные блюда" },
  { aliases: ["tavuk yemekleri", "tavuk yemeği"], en: "Chicken Dishes", ru: "Блюда из курицы" },
  { aliases: ["balık", "balıklar"], en: "Fish", ru: "Рыба" },
  { aliases: ["deniz ürünleri", "deniz ürünü"], en: "Seafood", ru: "Морепродукты" },
  { aliases: ["mezeler", "meze"], en: "Meze", ru: "Мезе" },
  { aliases: ["çocuk menüsü", "cocuk menusu"], en: "Kids Menu", ru: "Детское меню" },
  { aliases: ["dondurma"], en: "Ice Cream", ru: "Мороженое" },
  { aliases: ["kokteyller", "kokteyl"], en: "Cocktails", ru: "Коктейли" },
  { aliases: ["şaraplar", "şarap", "saraplar"], en: "Wines", ru: "Вина" },
  { aliases: ["biralar", "bira"], en: "Beers", ru: "Пиво" },
  { aliases: ["viskiler", "viski", "whisky"], en: "Whisky", ru: "Виски" },
];

function foldTurkishLetters(value: string): string {
  return value
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

export function normalizeMenuCategoryKey(value: string): string {
  const lowered = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
  return lowered
    .replace(/[.,!?:;·•"'`´''""()[\]{}]/g, "")
    .replace(/[-–—_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function registerKey(
  map: Map<string, MenuCategoryTranslation>,
  raw: string,
  entry: MenuCategoryTranslation
) {
  const key = normalizeMenuCategoryKey(raw);
  if (!key) return;
  map.set(key, entry);
  const folded = foldTurkishLetters(key);
  if (folded && folded !== key) map.set(folded, entry);
}

const CATEGORY_LOOKUP: Map<string, MenuCategoryTranslation> = (() => {
  const map = new Map<string, MenuCategoryTranslation>();
  for (const entry of MENU_CATEGORY_DICTIONARY) {
    const translation = { en: entry.en, ru: entry.ru };
    for (const alias of entry.aliases) {
      registerKey(map, alias, translation);
    }
    registerKey(map, entry.en, translation);
    registerKey(map, entry.ru, translation);
  }
  return map;
})();

export function lookupMenuCategoryTranslation(
  text: string,
  targetLanguage: TargetLanguage
): string | null {
  const key = normalizeMenuCategoryKey(text);
  if (!key) return null;
  const hit = CATEGORY_LOOKUP.get(key) ?? CATEGORY_LOOKUP.get(foldTurkishLetters(key));
  return hit ? hit[targetLanguage] : null;
}

export async function translateCategoryTitle(
  text: string,
  sourceLanguage: SourceLanguage,
  targetLanguage: TargetLanguage,
  fallbackTranslate: (request: MenuCategoryFallbackRequest) => Promise<string | null>
): Promise<string | null> {
  const source = text.trim();
  if (!source || sourceLanguage === targetLanguage) return null;
  const fromDictionary = lookupMenuCategoryTranslation(source, targetLanguage);
  if (fromDictionary) return fromDictionary;
  const translated = await fallbackTranslate({
    text: source,
    sourceLanguage,
    targetLanguage,
    context: MENU_CATEGORY_TRANSLATE_CONTEXT,
  });
  return translated?.trim() || null;
}

export type CategoryNameFields = {
  name?: string | null;
  name_en?: string | null;
  name_ru?: string | null;
};

export type CategoryNamePatch = {
  name_en?: string;
  name_ru?: string;
};

export async function fillMissingCategoryName(
  category: CategoryNameFields,
  targetLanguage: TargetLanguage,
  fallbackTranslate: (request: MenuCategoryFallbackRequest) => Promise<string | null>
): Promise<CategoryNamePatch> {
  const plan = planMissingLocalizedField(
    category.name,
    category.name_en,
    category.name_ru,
    targetLanguage
  );
  if (!plan) return {};
  const translated = await translateCategoryTitle(
    plan.text,
    plan.sourceLanguage,
    targetLanguage,
    fallbackTranslate
  );
  if (!translated) return {};
  return targetLanguage === "en" ? { name_en: translated } : { name_ru: translated };
}
