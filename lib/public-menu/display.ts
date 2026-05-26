import type { PublicMenuCollection } from "@/lib/public-menu/menu-collections";

export function getMenuCollectionTitle(
  collection: PublicMenuCollection,
  language: string
): string {
  if (language === "en" && collection.name_en?.trim()) return collection.name_en.trim();
  if (language === "ru" && collection.name_ru?.trim()) return collection.name_ru.trim();
  return collection.name;
}

export function getMenuCollectionSubtitle(
  collection: PublicMenuCollection,
  language: string
): string | null {
  if (collection.start_time && collection.end_time) {
    return `${formatTimeLabel(collection.start_time)} — ${formatTimeLabel(collection.end_time)}`;
  }
  const desc = collection.description?.trim();
  if (desc) return desc;
  return null;
}

function formatTimeLabel(time: string): string {
  const parts = time.split(":");
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return time;
}

export function getAllDayLabel(language: string): string {
  if (language === "en") return "All day";
  if (language === "ru") return "Весь день";
  return "Gün boyu";
}

export function getMenuPickSubtitle(language: string): string {
  if (language === "en") return "Choose your menu";
  if (language === "ru") return "Выберите меню";
  return "Menünüzü seçin";
}

/** Kart ikonu — DB’de emoji yok; isimden basit sezgi. */
export function getMenuCollectionEmoji(collection: PublicMenuCollection): string {
  const text = collection.name.toLocaleLowerCase("tr-TR");
  if (/içecek|icecek|drink|bar\b|şarap|sarap|bira/.test(text)) return "🍷";
  if (/öğle|ogle|lunch|brunch|kahvalt/.test(text)) return "☀️";
  if (/akşam|aksam|dinner|gece/.test(text)) return "🌙";
  if (/cafe|café|kahve|coffee/.test(text)) return "☕";
  if (/tatlı|tatli|dessert/.test(text)) return "🍰";
  return "🍽️";
}

export function categoryBelongsToMenuCollection(
  category: { menu_collection_ids?: string[] },
  menuCollectionId: string
): boolean {
  const ids = category.menu_collection_ids;
  return Array.isArray(ids) && ids.includes(menuCollectionId);
}
