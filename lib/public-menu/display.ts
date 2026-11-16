import type { PublicMenuCollection } from "@/lib/public-menu/menu-collections";
import { describeSchedule } from "@/lib/public-menu/schedule";
import { pickLang } from "@/lib/i18n/languages";
import { translatedText } from "@/lib/i18n/translations";

export function getMenuCollectionTitle(
  collection: PublicMenuCollection,
  language: string
): string {
  return translatedText(collection, "name", language) ?? collection.name;
}

export function getMenuCollectionSubtitle(
  collection: PublicMenuCollection,
  language: string
): string | null {
  const scheduled = describeSchedule(collection.schedule ?? null, language);
  if (scheduled) return scheduled;
  if (collection.start_time && collection.end_time) {
    return `${formatTimeLabel(collection.start_time)} — ${formatTimeLabel(collection.end_time)}`;
  }
  const desc = translatedText(collection, "description", language) ?? collection.description?.trim();
  if (desc) return desc;
  return null;
}

function formatTimeLabel(time: string): string {
  const parts = time.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return time;
}

export function getAllDayLabel(language: string): string {
  return pickLang(language, {
    tr: "Gün boyu",
    en: "All day",
    ru: "Весь день",
    de: "Ganztägig",
    fr: "Toute la journée",
    es: "Todo el día",
    it: "Tutto il giorno",
    uk: "Весь день",
    zh: "全天",
    az: "Bütün gün",
  });
}

export function getMenuPickSubtitle(language: string): string {
  return pickLang(language, {
    tr: "Menünüzü seçin",
    en: "Choose your menu",
    ru: "Выберите меню",
    de: "Wählen Sie Ihre Speisekarte",
    fr: "Choisissez votre menu",
    es: "Elija su menú",
    it: "Scegli il tuo menù",
    uk: "Оберіть меню",
    zh: "请选择菜单",
    az: "Menyunuzu seçin",
  });
}

/** Kart ikonu — DB’de emoji yok; isimden basit sezgi. */
export function getMenuCollectionEmoji(collection: {
  name: string;
}): string {
  const text = collection.name.toLocaleLowerCase("tr-TR");
  if (/içecek|icecek|drink|bar\b|şarap|sarap|bira/.test(text)) return "🍷";
  if (/öğle|ogle|lunch|brunch|kahvalt/.test(text)) return "☀️";
  if (/akşam|aksam|dinner|gece/.test(text)) return "🌙";
  if (/cafe|café|kahve|coffee/.test(text)) return "☕";
  if (/tatlı|tatli|dessert/.test(text)) return "🍰";
  return "🍽️";
}

/**
 * Public picker card visual.
 * - none → no left visual
 * - image with URL → photo
 * - image without URL → fall back to heuristic icon (safe UX)
 * - icon / missing → heuristic icon
 */
export type MenuCollectionCardVisual =
  | { mode: "none" }
  | { mode: "icon"; emoji: string }
  | { mode: "image"; imageUrl: string };

export function resolveMenuCollectionCardVisual(
  collection: Pick<PublicMenuCollection, "name" | "card_visual_type" | "card_image_url">
): MenuCollectionCardVisual {
  const type = collection.card_visual_type || "icon";
  if (type === "none") return { mode: "none" };
  if (type === "image") {
    const url = collection.card_image_url?.trim();
    if (url) return { mode: "image", imageUrl: url };
    return { mode: "icon", emoji: getMenuCollectionEmoji(collection) };
  }
  return { mode: "icon", emoji: getMenuCollectionEmoji(collection) };
}

export function categoryBelongsToMenuCollection(
  category: { menu_collection_ids?: string[] },
  menuCollectionId: string
): boolean {
  const ids = category.menu_collection_ids;
  return Array.isArray(ids) && ids.includes(menuCollectionId);
}

/** Ürün seçili menüde mi? Önce product ids; yoksa kategori mirası (E2 API defensive fallback). */
export function productBelongsToMenuCollection(
  product: { menu_collection_ids?: string[] },
  menuCollectionId: string,
  category?: { menu_collection_ids?: string[] }
): boolean {
  const productIds = product.menu_collection_ids;
  if (Array.isArray(productIds) && productIds.length > 0) {
    return productIds.includes(menuCollectionId);
  }
  if (category) {
    return categoryBelongsToMenuCollection(category, menuCollectionId);
  }
  return false;
}
