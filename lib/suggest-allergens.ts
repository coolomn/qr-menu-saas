/**
 * İstemci tarafı alerjen önerisi (sabit anahtar kelimeler, ağ çağrısı yok).
 * Tıbbi veya hukuki garanti değildir; yanlış pozitif/negatif olabilir.
 */

export type AllergenId = "gluten" | "dairy" | "nuts" | "seafood" | "egg" | "sesame" | "vegan" | "spicy";

export type AllergenConfidence = "explicit" | "inferred";

export type AllergenSuggestion = {
  id: AllergenId;
  confidence: AllergenConfidence;
};

/** Tüm harfleri koru (Kiril vb.); kelime sınırı için boşlukla pad'leriz. */
function normalizePadded(text: string): string {
  const lowered = text.toLocaleLowerCase("tr-TR");
  const spaced = lowered.replace(/[^\p{L}\p{N}]+/gu, " ");
  return ` ${spaced.replace(/\s+/g, " ").trim()} `;
}

const GLUTEN_NEGATION = /glütensiz|glutensiz|gluten[\s-]*free|\bgf\b/i;
const DAIRY_NEGATION = /laktozsuz|lactose[\s-]*free|dairy[\s-]*free|sütsüz|sutsuz/i;
const NUT_NEGATION = /nut[\s-]*free|nuts[\s-]*free|fındıksız|findiksiz|fıstıksız|fistiksiz|kuruyemişsiz|kuruyemissiz/i;
const EGG_NEGATION = /yumurtasız|egg[\s-]*free/i;

const VEGAN_REGEX = /\bvegan\b|\bvigan\b|\bвеган\b|\bвеганский\b|\bвеганская\b/iu;

const KEYWORDS: Record<Exclude<AllergenId, "vegan">, string[]> = {
  gluten: [
    "buğday",
    "bugday",
    "buğday unu",
    "bugday unu",
    "irmik",
    "bulgur",
    "arpa",
    "çavdar",
    "cavdar",
    "yulaf",
    "galeta",
    "kraker",
    "makarna",
    "erişte",
    "eriste",
    "tagliatelle",
    "spaghetti",
    "linguine",
    "fettuccine",
    "penne",
    "fusilli",
    "rigatoni",
    "farfalle",
    "cavatappi",
    "pappardelle",
    "ravioli",
    "tortellini",
    "lasagna",
    "lasagne",
    "gnocchi",
    "cannelloni",
    "manicotti",
    "orzo",
    "fide",
    "udon",
    "ramen",
    "pasta",
    "mantı",
    "manti",
    "hamur",
    "yufka",
    "baklava",
    "kadayıf",
    "kadayif",
    "kataifi",
    "ekmek",
    "sandviç",
    "sandvic",
    "burger",
    "pizza",
    "wrap",
    "tortilla",
    "couscous",
    "kuskus",
    "semolina",
    "gluten",
    "wheat",
    "barley",
    "rye",
    "oats",
    "flour",
    "panko",
    "breadcrumb",
    "пшеница",
    "мука",
    "рожь",
    "ячмень",
    "овес",
    "глютен",
    "макароны",
    "пицца",
    "булочка",
    "лаваш",
  ],
  dairy: [
    "süt",
    "sut",
    "sütlü",
    "sutlu",
    "peynir",
    "tereyağı",
    "tereyagi",
    "butter",
    "krema",
    "cream",
    "kaymak",
    "yoğurt",
    "yogurt",
    "labne",
    "kaşar",
    "kasar",
    "mozzarella",
    "parmesan",
    "ricotta",
    "feta",
    "cheddar",
    "gouda",
    "mascarpone",
    "muhallebi",
    "sütlaç",
    "sutlac",
    "kazandibi",
    "dondurma",
    "ayran",
    "cheesecake",
    "milk",
    "cheese",
    "lactose",
    "молоко",
    "сыр",
    "сливоч",
    "масло",
    "йогурт",
    "творог",
    "кефир",
    "сливки",
    "мороженое",
  ],
  nuts: [
    "fıstık",
    "fistik",
    "antep fıstığı",
    "antep fistigi",
    "pistachio",
    "fındık",
    "findik",
    "hazelnut",
    "ceviz",
    "walnut",
    "badem",
    "almond",
    "kaju",
    "cashew",
    "pecan",
    "macadamia",
    "kuruyemiş",
    "kuruyemis",
    "peanut",
    "groundnut",
    "орехи",
    "миндаль",
    "фундук",
    "фисташки",
    "арахис",
    "грецкий орех",
  ],
  seafood: [
    "balık",
    "balik",
    "fish",
    "somon",
    "salmon",
    "ton balığı",
    "ton baligi",
    "tuna",
    "levrek",
    "çupra",
    "cupra",
    "sea bass",
    "hamsi",
    "uskumru",
    "sardalya",
    "midye",
    "mussel",
    "ahtapot",
    "octopus",
    "kalamar",
    "squid",
    "calamari",
    "karides",
    "shrimp",
    "prawn",
    "deniz ürünleri",
    "deniz urunleri",
    "deniz urunu",
    "deniz mahsulü",
    "deniz mahsulu",
    "seafood",
    "sushi",
    "suşi",
    "susi",
    "sashimi",
    "anchovy",
    "рыба",
    "лосось",
    "тунец",
    "креветки",
    "кальмар",
    "осьминог",
    "мидии",
    "икра",
    "сурими",
  ],
  egg: [
    "yumurta",
    "egg",
    "omlet",
    "omelette",
    "mayonez",
    "mayonnaise",
    "mereng",
    "meringue",
    "custard",
    "carbonara",
    "hollandaise",
    "menemen",
    "яйцо",
    "яйца",
    "омлет",
    "майонез",
  ],
  sesame: [
    "susam",
    "sesame",
    "tahin",
    "tahini",
    "tahinli",
    "susamlı",
    "susamli",
    "кунжут",
    "тахин",
  ],
  spicy: [
    "acı",
    "acılı",
    "aci",
    "acili",
    "jalapeño",
    "jalapeno",
    "pul biber",
    "isot",
    "chili",
    "chilli",
    "cayenne",
    "wasabi",
    "sriracha",
    "tabasco",
    "ghost pepper",
    "habanero",
    "spicy",
    "hot sauce",
    "острый",
    "острая",
    "перец",
    "чили",
    "табаско",
  ],
};

function tokenMatchesKeyword(token: string, keyword: string): boolean {
  if (token === keyword) return true;
  if (keyword.length >= 4 && token.startsWith(keyword)) return true;
  return false;
}

function addIfKeyword(norm: string, id: AllergenId, words: string[], out: Map<AllergenId, AllergenConfidence>) {
  const tokens = norm.trim().split(" ").filter(Boolean);
  for (const w of words) {
    const t = w.toLocaleLowerCase("tr-TR").trim();
    if (t.length < 2) continue;
    if (norm.includes(` ${t} `) || tokens.some((token) => tokenMatchesKeyword(token, t))) {
      out.set(id, "explicit");
      return;
    }
  }
}

const INFERRED_DISHES: Array<{ keys: string[]; allergens: AllergenId[] }> = [
  { keys: ["brownie", "kek", "cake", "muffin", "cupcake", "cookie", "kurabiye"], allergens: ["egg", "dairy", "gluten"] },
  { keys: ["cheesecake"], allergens: ["dairy", "egg"] },
  { keys: ["simit", "ekmek", "pide", "lahmacun", "börek", "borek", "poğaça", "pogaca", "croissant"], allergens: ["gluten"] },
  { keys: ["baklava", "kadayıf", "kadayif", "kataifi"], allergens: ["gluten", "nuts"] },
  { keys: ["pizza", "burger", "sandviç", "sandvic", "pasta", "makarna"], allergens: ["gluten"] },
];

function addInferred(norm: string, out: Map<AllergenId, AllergenConfidence>) {
  const tokens = norm.trim().split(" ").filter(Boolean);
  for (const dish of INFERRED_DISHES) {
    const hit = dish.keys.some((key) => {
      const t = key.toLocaleLowerCase("tr-TR");
      return norm.includes(` ${t} `) || tokens.some((token) => tokenMatchesKeyword(token, t));
    });
    if (!hit) continue;
    for (const id of dish.allergens) {
      if (!out.has(id)) out.set(id, "inferred");
    }
  }
}

function applyNegations(combined: string, out: Map<AllergenId, AllergenConfidence>) {
  if (GLUTEN_NEGATION.test(combined)) out.delete("gluten");
  if (DAIRY_NEGATION.test(combined)) out.delete("dairy");
  if (NUT_NEGATION.test(combined)) out.delete("nuts");
  if (EGG_NEGATION.test(combined)) out.delete("egg");
  if (VEGAN_REGEX.test(combined)) {
    out.set("vegan", "explicit");
    out.delete("dairy");
    out.delete("egg");
  }
}

const ALLOWED = new Set<string>([
  "gluten",
  "dairy",
  "nuts",
  "seafood",
  "egg",
  "sesame",
  "vegan",
  "spicy",
]);

export type AllergenSuggestInput = {
  name?: string | null;
  description?: string | null;
  categoryName?: string | null;
  name_en?: string | null;
  description_en?: string | null;
  name_ru?: string | null;
  description_ru?: string | null;
};

function collectSuggestions(parts: string[]): AllergenSuggestion[] {
  const combined = parts.filter((p) => p && String(p).trim()).join("\n");
  if (!combined.trim()) return [];

  const norm = normalizePadded(combined);
  const out = new Map<AllergenId, AllergenConfidence>();

  (Object.keys(KEYWORDS) as Exclude<AllergenId, "vegan">[]).forEach((id) => {
    addIfKeyword(norm, id, KEYWORDS[id], out);
  });
  addInferred(norm, out);
  applyNegations(combined, out);

  return Array.from(out.entries())
    .filter(([id]) => ALLOWED.has(id))
    .map(([id, confidence]) => ({ id, confidence }));
}

export function suggestAllergens(input: AllergenSuggestInput): AllergenSuggestion[] {
  return collectSuggestions([
    input.name,
    input.description,
    input.categoryName,
    input.name_en,
    input.description_en,
    input.name_ru,
    input.description_ru,
  ].filter((p): p is string => Boolean(p)));
}

/**
 * Ürün metinlerinden olası alerjen / etiket id'lerini döndürür (tekrarsız).
 * Çağıran taraf tüm görünür metinleri `parts` içinde birleştirmeli (ör. ürün adı + TR/EN/RU açıklamaları).
 */
export function suggestAllergenIdsFromText(parts: string[]): string[] {
  return collectSuggestions(parts).map((item) => item.id);
}
