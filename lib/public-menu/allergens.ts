import { toMenuLanguage, type LocalizedString, type MenuLanguage } from "@/lib/i18n/languages";

export type PublicMenuLanguage = MenuLanguage;

export type ResolvedAllergen = {
  id: string;
  label: string;
  icon: string;
};

type AllergenDefinition = {
  id: string;
  icon: string;
  labels: LocalizedString;
  /** DB id, TR/EN metin veya legacy id eşlemesi */
  aliases: string[];
};

function normalizeAllergenKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PUBLIC_MENU_ALLERGENS: AllergenDefinition[] = [
  {
    id: "gluten",
    icon: "🌾",
    labels: { tr: "Gluten", en: "Gluten", ru: "Глютен", de: "Gluten", fr: "Gluten", es: "Gluten", it: "Glutine", uk: "Глютен", zh: "麸质", az: "Qlüten" },
    aliases: ["gluten"],
  },
  {
    id: "milk",
    icon: "🥛",
    labels: { tr: "Süt", en: "Milk", ru: "Молоко", de: "Milch", fr: "Lait", es: "Leche", it: "Latte", uk: "Молоко", zh: "乳制品", az: "Süd" },
    aliases: ["milk", "dairy", "sut", "süt", "lactose"],
  },
  {
    id: "egg",
    icon: "🥚",
    labels: { tr: "Yumurta", en: "Egg", ru: "Яйцо", de: "Ei", fr: "Œuf", es: "Huevo", it: "Uova", uk: "Яйця", zh: "蛋", az: "Yumurta" },
    aliases: ["egg", "eggs", "yumurta", "yumurtali", "yumurtalı"],
  },
  {
    id: "fish",
    icon: "🐟",
    labels: { tr: "Balık", en: "Fish", ru: "Рыба", de: "Fisch", fr: "Poisson", es: "Pescado", it: "Pesce", uk: "Риба", zh: "鱼", az: "Balıq" },
    aliases: ["fish", "balik", "balık"],
  },
  {
    id: "crustaceans",
    icon: "🦐",
    labels: { tr: "Kabuklu Deniz Ürünleri", en: "Crustaceans", ru: "Ракообразные", de: "Krebstiere", fr: "Crustacés", es: "Crustáceos", it: "Crostacei", uk: "Ракоподібні", zh: "甲壳类", az: "Xərçəngkimilər" },
    aliases: [
      "crustaceans",
      "crustacean",
      "seafood",
      "deniz urunu",
      "deniz ürünü",
      "deniz mahsulu",
      "deniz mahsulü",
      "kabuklu deniz urunleri",
      "kabuklu deniz ürünleri",
      "karides",
      "shrimp",
      "prawn",
    ],
  },
  {
    id: "peanuts",
    icon: "🥜",
    labels: { tr: "Yer Fıstığı", en: "Peanuts", ru: "Арахис", de: "Erdnüsse", fr: "Arachides", es: "Cacahuetes", it: "Arachidi", uk: "Арахіс", zh: "花生", az: "Yer fındığı" },
    aliases: ["peanuts", "peanut", "yer fistigi", "yer fıstığı", "groundnut"],
  },
  {
    id: "soy",
    icon: "🫘",
    labels: { tr: "Soya", en: "Soy", ru: "Соя", de: "Soja", fr: "Soja", es: "Soja", it: "Soia", uk: "Соя", zh: "大豆", az: "Soya" },
    aliases: ["soy", "soya", "soybeans", "soy bean"],
  },
  {
    id: "tree_nuts",
    icon: "🌰",
    labels: { tr: "Sert Kabuklu Meyveler", en: "Tree Nuts", ru: "Орехи", de: "Schalenfrüchte", fr: "Fruits à coque", es: "Frutos de cáscara", it: "Frutta a guscio", uk: "Горіхи", zh: "坚果", az: "Qoz-fındıq" },
    aliases: [
      "tree nuts",
      "tree_nuts",
      "treenuts",
      "nuts",
      "kuruyemis",
      "kuruyemiş",
      "sert kabuklu meyveler",
      "findik",
      "fındık",
      "badem",
      "almond",
      "ceviz",
      "walnut",
      "kaju",
      "cashew",
    ],
  },
  {
    id: "sesame",
    icon: "🫓",
    labels: { tr: "Susam", en: "Sesame", ru: "Кунжут", de: "Sesam", fr: "Sésame", es: "Sésamo", it: "Sesamo", uk: "Кунжут", zh: "芝麻", az: "Küncüt" },
    aliases: ["sesame", "susam", "tahin", "tahini"],
  },
  {
    id: "mustard",
    icon: "🟡",
    labels: { tr: "Hardal", en: "Mustard", ru: "Горчица", de: "Senf", fr: "Moutarde", es: "Mostaza", it: "Senape", uk: "Гірчиця", zh: "芥末", az: "Xardal" },
    aliases: ["mustard", "hardal"],
  },
  {
    id: "celery",
    icon: "🥬",
    labels: { tr: "Kereviz", en: "Celery", ru: "Сельдерей", de: "Sellerie", fr: "Céleri", es: "Apio", it: "Sedano", uk: "Селера", zh: "芹菜", az: "Kərəviz" },
    aliases: ["celery", "kereviz"],
  },
  {
    id: "lupin",
    icon: "🌿",
    labels: { tr: "Acı Bakla", en: "Lupin", ru: "Люпин", de: "Lupinen", fr: "Lupin", es: "Altramuces", it: "Lupini", uk: "Люпин", zh: "羽扇豆", az: "Acı paxla" },
    aliases: ["lupin", "lupine", "aci bakla", "acı bakla"],
  },
  {
    id: "molluscs",
    icon: "🐚",
    labels: { tr: "Yumuşakçalar", en: "Molluscs", ru: "Моллюски", de: "Weichtiere", fr: "Mollusques", es: "Moluscos", it: "Molluschi", uk: "Молюски", zh: "软体动物", az: "Molyusklar" },
    aliases: [
      "molluscs",
      "mollusks",
      "mollusk",
      "yumusakcalar",
      "yumuşakçalar",
      "midye",
      "mussel",
      "kalamar",
      "squid",
      "ahtapot",
      "octopus",
    ],
  },
  {
    id: "sulphites",
    icon: "⚗️",
    labels: { tr: "Sülfitler", en: "Sulphites", ru: "Сульфиты", de: "Sulfite", fr: "Sulfites", es: "Sulfitos", it: "Solfiti", uk: "Сульфіти", zh: "亚硫酸盐", az: "Sulfitlər" },
    aliases: ["sulphites", "sulfites", "sulphite", "sulfite", "sulfitler", "sülfitler"],
  },
  {
    id: "vegan",
    icon: "🌱",
    labels: { tr: "Vegan", en: "Vegan", ru: "Веган", de: "Vegan", fr: "Végan", es: "Vegano", it: "Vegano", uk: "Веган", zh: "纯素", az: "Vegan" },
    aliases: ["vegan", "vegan"],
  },
  {
    id: "spicy",
    icon: "🌶️",
    labels: { tr: "Acı", en: "Spicy", ru: "Острое", de: "Scharf", fr: "Épicé", es: "Picante", it: "Piccante", uk: "Гостре", zh: "辣", az: "Acılı" },
    aliases: ["spicy", "hot", "aci", "acı", "acili", "acılı"],
  },
];

const ALLERGEN_BY_KEY = new Map<string, AllergenDefinition>();

for (const def of PUBLIC_MENU_ALLERGENS) {
  ALLERGEN_BY_KEY.set(normalizeAllergenKey(def.id), def);
  for (const alias of def.aliases) {
    ALLERGEN_BY_KEY.set(normalizeAllergenKey(alias), def);
  }
  ALLERGEN_BY_KEY.set(normalizeAllergenKey(def.labels.tr), def);
  ALLERGEN_BY_KEY.set(normalizeAllergenKey(def.labels.en), def);
  ALLERGEN_BY_KEY.set(normalizeAllergenKey(def.labels.ru), def);
}

function resolveLanguage(language: string): PublicMenuLanguage {
  return toMenuLanguage(language);
}

export function getAllergenLabel(def: AllergenDefinition, language: PublicMenuLanguage): string {
  return def.labels[language];
}

export function resolveAllergen(value: string, language: string): ResolvedAllergen | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const def = ALLERGEN_BY_KEY.get(normalizeAllergenKey(trimmed));
  if (!def) return null;

  const lang = resolveLanguage(language);
  return {
    id: def.id,
    label: getAllergenLabel(def, lang),
    icon: def.icon,
  };
}

/** Aynı canonical id tekrar etmesin (sıra korunur). */
export function resolveProductAllergens(
  allergens: string[] | null | undefined,
  language: string
): ResolvedAllergen[] {
  if (!Array.isArray(allergens) || allergens.length === 0) return [];

  const lang = resolveLanguage(language);
  const seen = new Set<string>();
  const out: ResolvedAllergen[] = [];

  for (const raw of allergens) {
    const resolved = resolveAllergen(raw, lang);
    if (!resolved || seen.has(resolved.id)) continue;
    seen.add(resolved.id);
    out.push(resolved);
  }

  return out;
}
