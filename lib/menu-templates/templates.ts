/**
 * Faz 2.11c: hazır şablon menüler (Türkçe + İngilizce).
 *
 * İLKELER (müşterinin menüsüne gidecek metin, bu yüzden):
 * - Fiyat, alerjen, rozet, kalori BOŞ: bunları yalnızca işletme bilebilir (yanlış alerjen bilgisi tehlikelidir).
 * - Açıklamalar ürünü TİPİK tarifiyle tanımlar (ör. "peynirli", "süt"); işletme kendi tarifine göre düzenlemelidir.
 *   Menşe, helal, vegan, glutensiz, organik, "taze", "ev yapımı" gibi iddialar YAZILMAZ.
 * - Şablon yalnızca tamamen BOŞ bir menüye yüklenir (lib/menu-templates/apply.ts).
 * - "draft" kategoriler (ör. Bar) yayında gelmez; işletme isterse yayına alır.
 */

export type TemplateGroup = "food" | "drinks";

export type TemplateProduct = {
  name: string;
  name_en: string;
  description: string;
  description_en: string;
};

export type TemplateCategory = {
  name: string;
  name_en: string;
  group: TemplateGroup;
  /** true = kategori ve ürünleri yayında gelmez (ör. alkollü içecekler). */
  draft?: boolean;
  products: TemplateProduct[];
};

export type MenuTemplateId = "cafe" | "restaurant" | "hotel";

export type MenuTemplate = {
  id: MenuTemplateId;
  title: string;
  /** Seçim kartındaki kısa açıklama. */
  blurb: string;
  emoji: string;
  categories: TemplateCategory[];
};

/** Ana grup adları (müşteri menüsünde büyük başlık). Mevcut menülerle aynı yazım. */
export const TEMPLATE_GROUPS: Record<TemplateGroup, { tr: string; en: string }> = {
  food: { tr: "YİYECEKLER", en: "FOOD" },
  drinks: { tr: "İÇECEKLER", en: "DRINKS" },
};

const p = (name: string, name_en: string, description: string, description_en: string): TemplateProduct => ({
  name,
  name_en,
  description,
  description_en,
});

const cafe: MenuTemplate = {
  id: "cafe",
  title: "Kafe",
  blurb: "Kahve, çay, soğuk içecekler, tatlılar ve hafif atıştırmalıklar.",
  emoji: "☕",
  categories: [
    {
      name: "Sıcak İçecekler",
      name_en: "Hot Drinks",
      group: "drinks",
      products: [
        p("Türk Kahvesi", "Turkish Coffee", "Geleneksel yöntemle pişirilen kahve.", "Coffee brewed the traditional way."),
        p("Espresso", "Espresso", "Yoğun, tek shot kahve.", "A concentrated single shot of coffee."),
        p("Americano", "Americano", "Espresso ve sıcak su.", "Espresso with hot water."),
        p("Latte", "Latte", "Espresso ve buharla ısıtılmış süt.", "Espresso with steamed milk."),
        p("Cappuccino", "Cappuccino", "Espresso, süt ve süt köpüğü.", "Espresso, milk and milk foam."),
        p("Filtre Kahve", "Filter Coffee", "Filtreden süzülmüş kahve.", "Filter-brewed coffee."),
        p("Çay", "Tea", "Demlenmiş siyah çay.", "Brewed black tea."),
        p("Bitki Çayı", "Herbal Tea", "Çeşitli bitki çayı seçenekleri.", "A choice of herbal teas."),
        p("Sıcak Çikolata", "Hot Chocolate", "Çikolata ve sıcak süt.", "Chocolate with hot milk."),
      ],
    },
    {
      name: "Soğuk İçecekler",
      name_en: "Cold Drinks",
      group: "drinks",
      products: [
        p("Buzlu Latte", "Iced Latte", "Espresso, soğuk süt ve buz.", "Espresso with cold milk and ice."),
        p("Buzlu Americano", "Iced Americano", "Espresso, soğuk su ve buz.", "Espresso with cold water and ice."),
        p("Limonata", "Lemonade", "Limon ile hazırlanan serinletici içecek.", "A refreshing drink made with lemon."),
        p("Soğuk Çay", "Iced Tea", "Buzla servis edilen soğuk çay.", "Chilled tea served over ice."),
        p("Meyve Suyu", "Fruit Juice", "Çeşitli meyve suyu seçenekleri.", "A choice of fruit juices."),
        p("Soda", "Soda", "Sade veya meyveli soda.", "Plain or fruit-flavored soda."),
        p("Su", "Water", "Şişelenmiş içme suyu.", "Bottled drinking water."),
      ],
    },
    {
      name: "Tatlılar",
      name_en: "Desserts",
      group: "food",
      products: [
        p("Cheesecake", "Cheesecake", "Kremsi dokulu peynirli tatlı.", "A creamy cheesecake."),
        p("Tiramisu", "Tiramisu", "Kahve ve mascarpone katmanlı tatlı.", "Layered coffee and mascarpone dessert."),
        p("Brownie", "Brownie", "Yoğun çikolatalı kek.", "A dense chocolate cake."),
        p("Sütlaç", "Rice Pudding", "Geleneksel sütlü tatlı.", "Traditional milk pudding."),
        p("Kurabiye", "Cookie", "Günün kurabiyesi.", "Cookie of the day."),
      ],
    },
    {
      name: "Atıştırmalıklar",
      name_en: "Snacks",
      group: "food",
      products: [
        p("Kruvasan", "Croissant", "Katmanlı hamur işi.", "A flaky pastry."),
        p("Tost", "Toasted Sandwich", "Kaşarlı sıcak tost.", "Toasted sandwich with cheese."),
        p("Sandviç", "Sandwich", "Ekmek arası sandviç.", "A sandwich on bread."),
        p("Börek", "Savory Pastry", "Dilim börek.", "A slice of savory pastry."),
        p("Simit", "Simit", "Geleneksel Türk simidi.", "Traditional Turkish ring-shaped bread."),
      ],
    },
  ],
};

const restaurant: MenuTemplate = {
  id: "restaurant",
  title: "Restoran",
  blurb: "Çorba, başlangıç, salata, ana yemek, pide, tatlı ve içecekler.",
  emoji: "🍽️",
  categories: [
    {
      name: "Çorbalar",
      name_en: "Soups",
      group: "food",
      products: [
        p("Mercimek Çorbası", "Lentil Soup", "Geleneksel mercimek çorbası.", "Traditional lentil soup."),
        p("Ezogelin Çorbası", "Ezogelin Soup", "Bulgur ve mercimekli geleneksel çorba.", "Traditional soup with bulgur and lentils."),
        p("Günün Çorbası", "Soup of the Day", "Şefin günlük çorbası.", "The chef's soup of the day."),
      ],
    },
    {
      name: "Başlangıçlar",
      name_en: "Starters",
      group: "food",
      products: [
        p("Humus", "Hummus", "Nohut ezmesi.", "Chickpea dip."),
        p("Haydari", "Haydari", "Yoğurtlu meze.", "Yogurt-based meze."),
        p("Közlenmiş Patlıcan", "Roasted Eggplant", "Közlenmiş patlıcan mezesi.", "Roasted eggplant meze."),
        p("Sigara Böreği", "Fried Pastry Rolls", "Çıtır sigara böreği.", "Crispy fried pastry rolls."),
        p("Mücver", "Zucchini Fritters", "Kabaklı mücver.", "Zucchini fritters."),
        p("Patates Kızartması", "French Fries", "Çıtır patates kızartması.", "Crispy fried potatoes."),
      ],
    },
    {
      name: "Salatalar",
      name_en: "Salads",
      group: "food",
      products: [
        p("Çoban Salata", "Shepherd's Salad", "Domates, salatalık ve soğan salatası.", "Tomato, cucumber and onion salad."),
        p("Mevsim Salata", "Seasonal Salad", "Mevsim yeşillikleri.", "Seasonal greens."),
        p("Sezar Salata", "Caesar Salad", "Marul, kruton ve sos.", "Lettuce, croutons and dressing."),
      ],
    },
    {
      name: "Ana Yemekler",
      name_en: "Main Courses",
      group: "food",
      products: [
        p("Izgara Köfte", "Grilled Meatballs", "Izgara köfte, yanında garnitür.", "Grilled meatballs served with a side."),
        p("Tavuk Şiş", "Chicken Skewer", "Izgara tavuk şiş, yanında garnitür.", "Grilled chicken skewer served with a side."),
        p("Adana Kebap", "Adana Kebab", "Acılı kıyma kebabı.", "Spicy minced meat kebab."),
        p("Karışık Izgara", "Mixed Grill", "Çeşitli ızgara et seçkisi.", "An assortment of grilled meats."),
        p("Kuzu Pirzola", "Lamb Chops", "Izgara kuzu pirzola.", "Grilled lamb chops."),
        p("Izgara Levrek", "Grilled Sea Bass", "Izgara levrek, yanında salata.", "Grilled sea bass served with salad."),
        p("Tavuk Sote", "Chicken Sauté", "Sebzeli tavuk sote.", "Sautéed chicken with vegetables."),
        p("Mantı", "Turkish Dumplings", "Yoğurt ve sos ile servis edilen mantı.", "Dumplings served with yogurt and sauce."),
      ],
    },
    {
      name: "Pide & Lahmacun",
      name_en: "Pide & Lahmacun",
      group: "food",
      products: [
        p("Kıymalı Pide", "Minced Meat Pide", "Kıymalı Türk pidesi.", "Turkish flatbread with minced meat."),
        p("Kuşbaşılı Pide", "Diced Meat Pide", "Kuşbaşı etli Türk pidesi.", "Turkish flatbread with diced meat."),
        p("Kaşarlı Pide", "Cheese Pide", "Kaşar peynirli Türk pidesi.", "Turkish flatbread with cheese."),
        p("Karışık Pide", "Mixed Pide", "Karışık malzemeli Türk pidesi.", "Turkish flatbread with mixed toppings."),
        p("Lahmacun", "Lahmacun", "İnce hamurlu geleneksel Türk lahmacunu.", "Traditional thin-crust Turkish flatbread."),
      ],
    },
    {
      name: "Tatlılar",
      name_en: "Desserts",
      group: "food",
      products: [
        p("Baklava", "Baklava", "Şerbetli geleneksel tatlı.", "Traditional syrup-soaked pastry."),
        p("Künefe", "Kunefe", "Peynirli sıcak tatlı.", "Warm cheese pastry dessert."),
        p("Sütlaç", "Rice Pudding", "Geleneksel sütlü tatlı.", "Traditional milk pudding."),
        p("Kazandibi", "Kazandibi", "Karamelize tabanlı sütlü tatlı.", "Milk pudding with a caramelized base."),
      ],
    },
    {
      name: "İçecekler",
      name_en: "Drinks",
      group: "drinks",
      products: [
        p("Su", "Water", "Şişelenmiş içme suyu.", "Bottled drinking water."),
        p("Ayran", "Ayran", "Yoğurt bazlı geleneksel içecek.", "Traditional yogurt-based drink."),
        p("Gazlı İçecek", "Soft Drink", "Çeşitli gazlı içecek seçenekleri.", "A choice of soft drinks."),
        p("Limonata", "Lemonade", "Limon ile hazırlanan serinletici içecek.", "A refreshing drink made with lemon."),
        p("Çay", "Tea", "Demlenmiş siyah çay.", "Brewed black tea."),
        p("Türk Kahvesi", "Turkish Coffee", "Geleneksel yöntemle pişirilen kahve.", "Coffee brewed the traditional way."),
      ],
    },
  ],
};

const hotel: MenuTemplate = {
  id: "hotel",
  title: "Otel / Oda Servisi",
  blurb: "Kahvaltı, oda servisi ana yemekleri, atıştırmalıklar, tatlılar, içecekler ve bar. Bar kategorisi yayında gelmez; kullanıyorsanız yayına alın.",
  emoji: "🏨",
  categories: [
    {
      name: "Kahvaltı",
      name_en: "Breakfast",
      group: "food",
      products: [
        p("Serpme Kahvaltı", "Turkish Breakfast Spread", "Bir arada servis edilen çeşitli kahvaltılıklar.", "A variety of breakfast items served together."),
        p("Kahvaltı Tabağı", "Breakfast Plate", "Kahvaltılık çeşitlerinden hazırlanan tabak.", "A plate of breakfast items."),
        p("Omlet", "Omelet", "Klasik omlet.", "A classic omelet."),
        p("Menemen", "Menemen", "Domates, biber ve yumurtalı geleneksel yemek.", "Traditional dish with tomatoes, peppers and eggs."),
        p("Sahanda Yumurta", "Fried Eggs", "Tavada pişirilen yumurta.", "Eggs cooked in a pan."),
        p("Pankek", "Pancakes", "Pankek, yanında şurup.", "Pancakes served with syrup."),
      ],
    },
    {
      name: "Çorba & Salata",
      name_en: "Soup & Salad",
      group: "food",
      products: [
        p("Mercimek Çorbası", "Lentil Soup", "Geleneksel mercimek çorbası.", "Traditional lentil soup."),
        p("Sezar Salata", "Caesar Salad", "Marul, kruton ve sos.", "Lettuce, croutons and dressing."),
        p("Çoban Salata", "Shepherd's Salad", "Domates, salatalık ve soğan salatası.", "Tomato, cucumber and onion salad."),
        p("Mevsim Salata", "Seasonal Salad", "Mevsim yeşillikleri.", "Seasonal greens."),
      ],
    },
    {
      name: "Ana Yemekler",
      name_en: "Main Courses",
      group: "food",
      products: [
        p("Club Sandwich", "Club Sandwich", "Üç katlı sandviç, yanında patates kızartması.", "Triple-decker sandwich served with fries."),
        p("Hamburger", "Burger", "Burger, yanında patates kızartması.", "Burger served with fries."),
        p("Izgara Tavuk", "Grilled Chicken", "Izgara tavuk, yanında garnitür.", "Grilled chicken served with a side."),
        p("Izgara Köfte", "Grilled Meatballs", "Izgara köfte, yanında garnitür.", "Grilled meatballs served with a side."),
        p("Spagetti Bolonez", "Spaghetti Bolognese", "Kıymalı domates soslu makarna.", "Pasta with a minced meat and tomato sauce."),
        p("Penne Arrabbiata", "Penne Arrabbiata", "Acılı domates soslu makarna.", "Pasta with a spicy tomato sauce."),
        p("Margarita Pizza", "Margherita Pizza", "Domates sosu ve mozzarella.", "Tomato sauce and mozzarella."),
        p("Günün Balığı", "Fish of the Day", "Günün balığı, yanında garnitür.", "Fish of the day served with a side."),
      ],
    },
    {
      name: "Atıştırmalıklar",
      name_en: "Snacks",
      group: "food",
      products: [
        p("Patates Kızartması", "French Fries", "Çıtır patates kızartması.", "Crispy fried potatoes."),
        p("Peynir Tabağı", "Cheese Plate", "Çeşitli peynirlerden oluşan tabak.", "A plate of assorted cheeses."),
        p("Meyve Tabağı", "Fruit Plate", "Mevsim meyvelerinden tabak.", "A plate of seasonal fruit."),
        p("Kuruyemiş", "Mixed Nuts", "Kuruyemiş karışımı.", "A mix of nuts."),
      ],
    },
    {
      name: "Tatlılar",
      name_en: "Desserts",
      group: "food",
      products: [
        p("Cheesecake", "Cheesecake", "Kremsi dokulu peynirli tatlı.", "A creamy cheesecake."),
        p("Sütlaç", "Rice Pudding", "Geleneksel sütlü tatlı.", "Traditional milk pudding."),
        p("Baklava", "Baklava", "Şerbetli geleneksel tatlı.", "Traditional syrup-soaked pastry."),
        p("Dondurma", "Ice Cream", "Çeşitli dondurma topları.", "Assorted scoops of ice cream."),
      ],
    },
    {
      name: "İçecekler",
      name_en: "Drinks",
      group: "drinks",
      products: [
        p("Su", "Water", "Şişelenmiş içme suyu.", "Bottled drinking water."),
        p("Maden Suyu", "Mineral Water", "Şişe maden suyu.", "Bottled mineral water."),
        p("Gazlı İçecek", "Soft Drink", "Çeşitli gazlı içecek seçenekleri.", "A choice of soft drinks."),
        p("Meyve Suyu", "Fruit Juice", "Çeşitli meyve suyu seçenekleri.", "A choice of fruit juices."),
        p("Çay", "Tea", "Demlenmiş siyah çay.", "Brewed black tea."),
        p("Türk Kahvesi", "Turkish Coffee", "Geleneksel yöntemle pişirilen kahve.", "Coffee brewed the traditional way."),
        p("Filtre Kahve", "Filter Coffee", "Filtreden süzülmüş kahve.", "Filter-brewed coffee."),
      ],
    },
    {
      name: "Bar",
      name_en: "Bar",
      group: "drinks",
      draft: true,
      products: [
        p("Bira", "Beer", "Çeşitli bira seçenekleri.", "A choice of beers."),
        p("Beyaz Şarap (Kadeh)", "White Wine (Glass)", "Kadehte beyaz şarap.", "White wine by the glass."),
        p("Kırmızı Şarap (Kadeh)", "Red Wine (Glass)", "Kadehte kırmızı şarap.", "Red wine by the glass."),
        p("Kokteyl", "Cocktail", "Çeşitli kokteyl seçenekleri.", "A choice of cocktails."),
      ],
    },
  ],
};

export const MENU_TEMPLATES: readonly MenuTemplate[] = [cafe, restaurant, hotel];

export function getMenuTemplate(id: string): MenuTemplate | null {
  return MENU_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function countTemplateProducts(template: MenuTemplate): number {
  return template.categories.reduce((n, c) => n + c.products.length, 0);
}
