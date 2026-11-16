import type { LocalizedString, MenuLanguage } from "@/lib/i18n/languages";

type FallbackLabel = Omit<LocalizedString, "tr">;

/**
 * İşletme çeviri girmemişse yaygın Türkçe ana grup / kategori adları için yedek çeviriler.
 * Anahtar: Türkçe büyük harf, tek boşluk (normalizeMenuLabelKey).
 */
const MENU_LABEL_FALLBACK: Record<string, FallbackLabel> = {
  YİYECEKLER: { en: "Foods", ru: "Блюда", de: "Speisen", fr: "Plats", es: "Comidas", it: "Piatti", uk: "Страви", zh: "食品", az: "Yeməklər" },
  İÇECEKLER: { en: "Drinks", ru: "Напитки", de: "Getränke", fr: "Boissons", es: "Bebidas", it: "Bevande", uk: "Напої", zh: "饮品", az: "İçkilər" },
  DİĞER: { en: "Other", ru: "Другое", de: "Sonstiges", fr: "Autres", es: "Otros", it: "Altro", uk: "Інше", zh: "其他", az: "Digər" },
  KAHVE: { en: "Coffee", ru: "Кофе", de: "Kaffee", fr: "Café", es: "Café", it: "Caffè", uk: "Кава", zh: "咖啡", az: "Qəhvə" },
  "ALKOLLÜ İÇECEKLER": { en: "Alcoholic drinks", ru: "Алкогольные напитки", de: "Alkoholische Getränke", fr: "Boissons alcoolisées", es: "Bebidas alcohólicas", it: "Bevande alcoliche", uk: "Алкогольні напої", zh: "酒精饮品", az: "Spirtli içkilər" },
  "ALKOLSÜZ İÇECEKLER": { en: "Non-alcoholic drinks", ru: "Безалкогольные напитки", de: "Alkoholfreie Getränke", fr: "Boissons sans alcool", es: "Bebidas sin alcohol", it: "Bevande analcoliche", uk: "Безалкогольні напої", zh: "无酒精饮品", az: "Spirtsiz içkilər" },
  KAHVALTI: { en: "Breakfast", ru: "Завтрак", de: "Frühstück", fr: "Petit-déjeuner", es: "Desayuno", it: "Colazione", uk: "Сніданок", zh: "早餐", az: "Səhər yeməyi" },
  BURGER: { en: "Burgers", ru: "Бургеры", de: "Burger", fr: "Burgers", es: "Hamburguesas", it: "Hamburger", uk: "Бургери", zh: "汉堡", az: "Burgerlər" },
  PİZZA: { en: "Pizza", ru: "Пицца", de: "Pizza", fr: "Pizzas", es: "Pizzas", it: "Pizze", uk: "Піца", zh: "披萨", az: "Pizza" },
  PIZZA: { en: "Pizza", ru: "Пицца", de: "Pizza", fr: "Pizzas", es: "Pizzas", it: "Pizze", uk: "Піца", zh: "披萨", az: "Pizza" },
  TATLILAR: { en: "Desserts", ru: "Десерты", de: "Desserts", fr: "Desserts", es: "Postres", it: "Dolci", uk: "Десерти", zh: "甜点", az: "Desertlər" },
  MEZE: { en: "Meze", ru: "Мезе", de: "Meze", fr: "Mezzés", es: "Meze", it: "Meze", uk: "Мезе", zh: "土耳其冷盘", az: "Meze" },
  MEZELER: { en: "Cold starters", ru: "Закуски", de: "Kalte Vorspeisen", fr: "Entrées froides", es: "Entrantes fríos", it: "Antipasti freddi", uk: "Холодні закуски", zh: "冷盘", az: "Soyuq qəlyanaltılar" },
  ÇORBA: { en: "Soups", ru: "Супы", de: "Suppen", fr: "Soupes", es: "Sopas", it: "Zuppe", uk: "Супи", zh: "汤", az: "Şorbalar" },
  SALATA: { en: "Salads", ru: "Салаты", de: "Salate", fr: "Salades", es: "Ensaladas", it: "Insalate", uk: "Салати", zh: "沙拉", az: "Salatlar" },
  "ANA YEMEK": { en: "Main courses", ru: "Основные блюда", de: "Hauptgerichte", fr: "Plats principaux", es: "Platos principales", it: "Secondi piatti", uk: "Основні страви", zh: "主菜", az: "Əsas yeməklər" },
  "ARA SICAK": { en: "Hot appetizers", ru: "Горячие закуски", de: "Warme Vorspeisen", fr: "Entrées chaudes", es: "Entrantes calientes", it: "Antipasti caldi", uk: "Гарячі закуски", zh: "热前菜", az: "İsti qəlyanaltılar" },
  "SOĞUK İÇECEKLER": { en: "Cold drinks", ru: "Холодные напитки", de: "Kalte Getränke", fr: "Boissons fraîches", es: "Bebidas frías", it: "Bevande fredde", uk: "Холодні напої", zh: "冷饮", az: "Soyuq içkilər" },
  "SICAK İÇECEKLER": { en: "Hot drinks", ru: "Горячие напитки", de: "Heiße Getränke", fr: "Boissons chaudes", es: "Bebidas calientes", it: "Bevande calde", uk: "Гарячі напої", zh: "热饮", az: "İsti içkilər" },
  MAKARNALAR: { en: "Pasta", ru: "Паста", de: "Pasta", fr: "Pâtes", es: "Pasta", it: "Pasta", uk: "Паста", zh: "意面", az: "Makaronlar" },
  BALIK: { en: "Fish", ru: "Рыба", de: "Fisch", fr: "Poissons", es: "Pescado", it: "Pesce", uk: "Риба", zh: "鱼类", az: "Balıq" },
  DENİZ: { en: "Seafood", ru: "Морепродукты", de: "Meeresfrüchte", fr: "Fruits de mer", es: "Mariscos", it: "Frutti di mare", uk: "Морепродукти", zh: "海鲜", az: "Dəniz məhsulları" },
  "DENİZ ÜRÜNLERİ": { en: "Seafood", ru: "Морепродукты", de: "Meeresfrüchte", fr: "Fruits de mer", es: "Mariscos", it: "Frutti di mare", uk: "Морепродукти", zh: "海鲜", az: "Dəniz məhsulları" },
  TAVUK: { en: "Chicken", ru: "Курица", de: "Hähnchen", fr: "Poulet", es: "Pollo", it: "Pollo", uk: "Курка", zh: "鸡肉", az: "Toyuq" },
  KUZU: { en: "Lamb", ru: "Баранина", de: "Lamm", fr: "Agneau", es: "Cordero", it: "Agnello", uk: "Баранина", zh: "羊肉", az: "Quzu" },
  DANA: { en: "Beef", ru: "Говядина", de: "Rind", fr: "Bœuf", es: "Ternera", it: "Manzo", uk: "Яловичина", zh: "牛肉", az: "Mal əti" },
  "VEJETARYEN MENÜ": { en: "Vegetarian", ru: "Вегетарианское меню", de: "Vegetarisch", fr: "Végétarien", es: "Vegetariano", it: "Vegetariano", uk: "Вегетаріанське меню", zh: "素食", az: "Vegetarian menyu" },
  VEGAN: { en: "Vegan", ru: "Веган", de: "Vegan", fr: "Végan", es: "Vegano", it: "Vegano", uk: "Веган", zh: "纯素", az: "Vegan" },
  ÇOCUK: { en: "Kids", ru: "Детское", de: "Kinder", fr: "Enfants", es: "Infantil", it: "Bambini", uk: "Дитяче", zh: "儿童", az: "Uşaq" },
  "ÇOCUK MENÜSÜ": { en: "Kids menu", ru: "Детское меню", de: "Kindermenü", fr: "Menu enfant", es: "Menú infantil", it: "Menù bambini", uk: "Дитяче меню", zh: "儿童餐", az: "Uşaq menyusu" },
};

export function normalizeMenuLabelKey(s: string): string {
  return s.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim();
}

/** Yedek çeviri yoksa null. */
export function menuLabelFallback(turkishLabel: string, language: MenuLanguage): string | null {
  if (language === "tr") return null;
  return MENU_LABEL_FALLBACK[normalizeMenuLabelKey(turkishLabel)]?.[language] ?? null;
}
