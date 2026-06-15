export type PublicMenuLanguage = "tr" | "en" | "ru";

export type ResolvedAllergen = {
  id: string;
  label: string;
  icon: string;
};

type AllergenDefinition = {
  id: string;
  icon: string;
  labels: Record<"tr" | "en", string> & { ru?: string };
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
    labels: { tr: "Gluten", en: "Gluten", ru: "Глютен" },
    aliases: ["gluten"],
  },
  {
    id: "milk",
    icon: "🥛",
    labels: { tr: "Süt", en: "Milk", ru: "Молоко" },
    aliases: ["milk", "dairy", "sut", "süt", "lactose"],
  },
  {
    id: "egg",
    icon: "🥚",
    labels: { tr: "Yumurta", en: "Egg", ru: "Яйцо" },
    aliases: ["egg", "eggs", "yumurta", "yumurtali", "yumurtalı"],
  },
  {
    id: "fish",
    icon: "🐟",
    labels: { tr: "Balık", en: "Fish", ru: "Рыба" },
    aliases: ["fish", "balik", "balık"],
  },
  {
    id: "crustaceans",
    icon: "🦐",
    labels: { tr: "Kabuklu Deniz Ürünleri", en: "Crustaceans", ru: "Ракообразные" },
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
    labels: { tr: "Yer Fıstığı", en: "Peanuts", ru: "Арахис" },
    aliases: ["peanuts", "peanut", "yer fistigi", "yer fıstığı", "groundnut"],
  },
  {
    id: "soy",
    icon: "🫘",
    labels: { tr: "Soya", en: "Soy", ru: "Соя" },
    aliases: ["soy", "soya", "soybeans", "soy bean"],
  },
  {
    id: "tree_nuts",
    icon: "🌰",
    labels: { tr: "Sert Kabuklu Meyveler", en: "Tree Nuts", ru: "Орехи" },
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
    labels: { tr: "Susam", en: "Sesame", ru: "Кунжут" },
    aliases: ["sesame", "susam", "tahin", "tahini"],
  },
  {
    id: "mustard",
    icon: "🟡",
    labels: { tr: "Hardal", en: "Mustard", ru: "Горчица" },
    aliases: ["mustard", "hardal"],
  },
  {
    id: "celery",
    icon: "🥬",
    labels: { tr: "Kereviz", en: "Celery", ru: "Сельдерей" },
    aliases: ["celery", "kereviz"],
  },
  {
    id: "lupin",
    icon: "🌿",
    labels: { tr: "Acı Bakla", en: "Lupin", ru: "Люпин" },
    aliases: ["lupin", "lupine", "aci bakla", "acı bakla"],
  },
  {
    id: "molluscs",
    icon: "🐚",
    labels: { tr: "Yumuşakçalar", en: "Molluscs", ru: "Моллюски" },
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
    labels: { tr: "Sülfitler", en: "Sulphites", ru: "Сульфиты" },
    aliases: ["sulphites", "sulfites", "sulphite", "sulfite", "sulfitler", "sülfitler"],
  },
  {
    id: "vegan",
    icon: "🌱",
    labels: { tr: "Vegan", en: "Vegan", ru: "Веган" },
    aliases: ["vegan", "vegan"],
  },
  {
    id: "spicy",
    icon: "🌶️",
    labels: { tr: "Acı", en: "Spicy", ru: "Острое" },
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
  if (def.labels.ru) {
    ALLERGEN_BY_KEY.set(normalizeAllergenKey(def.labels.ru), def);
  }
}

function resolveLanguage(language: string): PublicMenuLanguage {
  if (language === "en" || language === "ru") return language;
  return "tr";
}

export function getAllergenLabel(def: AllergenDefinition, language: PublicMenuLanguage): string {
  if (language === "ru" && def.labels.ru) return def.labels.ru;
  return def.labels[language === "en" ? "en" : "tr"];
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
