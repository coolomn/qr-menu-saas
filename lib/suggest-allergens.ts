/**
 * Hibrit alerjen önerisi: deterministik kurallar + negatifler + isteğe bağlı AI.
 * Tıbbi veya hukuki garanti değildir; yanlış pozitif/negatif olabilir.
 */

export const EU_ALLERGEN_IDS = [
  "gluten",
  "crustaceans",
  "egg",
  "fish",
  "peanuts",
  "soy",
  "dairy",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export type EuAllergenId = (typeof EU_ALLERGEN_IDS)[number];

export type AllergenId =
  | EuAllergenId
  | "seafood"
  | "vegan"
  | "spicy";

export type AllergenConfidence = "explicit" | "inferred";

export type AllergenSuggestion = {
  id: AllergenId;
  confidence: AllergenConfidence;
  reason?: string;
};

export const ALLERGEN_TAG_IDS = new Set<AllergenId>(["vegan", "spicy"]);

/** Tüm harfleri koru (Kiril vb.); kelime sınırı için boşlukla pad'leriz. */
function normalizePadded(text: string): string {
  const lowered = text.toLocaleLowerCase("tr-TR");
  const spaced = lowered.replace(/[^\p{L}\p{N}]+/gu, " ");
  return ` ${spaced.replace(/\s+/g, " ").trim()} `;
}

const GLUTEN_NEGATION = /glütensiz|glutensiz|gluten[\s-]*free|\bgf\b/i;
const DAIRY_NEGATION =
  /laktozsuz|lactose[\s-]*free|dairy[\s-]*free|sütsüz|sutsuz|oat[\s-]*milk|almond[\s-]*milk|soy[\s-]*milk|soya[\s-]*süt|coconut[\s-]*milk|yulaf süt|badem süt|hindistan cevizi süt|bitkisel süt|plant[\s-]*milk|plant[\s-]*based[\s-]*milk/i;
const NUT_NEGATION = /nut[\s-]*free|nuts[\s-]*free|peanut[\s-]*free|fındıksız|findiksiz|fıstıksız|fistiksiz|kuruyemişsiz|kuruyemissiz/i;
const EGG_NEGATION = /yumurtasız|egg[\s-]*free/i;
const PLANT_MILK_REGEX =
  /oat[\s-]*milk|almond[\s-]*milk|soy[\s-]*milk|soya[\s-]*süt|coconut[\s-]*milk|yulaf süt|badem süt|hindistan cevizi süt|bitkisel süt|plant[\s-]*milk|plant[\s-]*based[\s-]*milk/i;
const ALMOND_MILK_REGEX = /almond[\s-]*milk|badem süt/i;
const SOY_MILK_REGEX = /soy[\s-]*milk|soya[\s-]*süt/i;

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
    "орехи",
    "миндаль",
    "фундук",
    "фисташки",
    "грецкий орех",
  ],
  peanuts: ["peanut", "peanuts", "groundnut", "yer fıstığı", "yer fistigi", "арахис"],
  soy: ["soya", "soy", "soybean", "soybeans", "соя"],
  mustard: ["hardal", "mustard", "dijon", "горчица"],
  celery: ["kereviz", "celery", "сельдерей"],
  lupin: ["lupin", "lupine", "acı bakla", "aci bakla", "люпин"],
  sulphites: ["sülfit", "sulfit", "sulphite", "sulfite", "sulphites", "sulfites"],
  fish: [
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
    "anchovy",
    "anchovies",
    "рыба",
    "лосось",
    "тунец",
    "икра",
  ],
  crustaceans: [
    "karides",
    "shrimp",
    "prawn",
    "crab",
    "lobster",
    "yengeç",
    "yengec",
    "istakoz",
    "deniz ürünleri",
    "deniz urunleri",
    "deniz urunu",
    "deniz mahsulü",
    "deniz mahsulu",
    "seafood",
    "креветки",
  ],
  molluscs: [
    "midye",
    "mussel",
    "ahtapot",
    "octopus",
    "kalamar",
    "squid",
    "calamari",
    "oyster",
    "istridye",
    "кальмар",
    "осьминог",
    "мидии",
  ],
  seafood: ["suşi", "susi", "sushi", "sashimi", "сурими"],
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

const INFERRED_BEVERAGES: Array<{ keys: string[]; allergens: AllergenId[] }> = [
  {
    keys: [
      "latte",
      "cappuccino",
      "kapuçino",
      "kapucino",
      "flat white",
      "macchiato",
      "mocha",
      "cortado",
      "cafe au lait",
      "café au lait",
      "sıcak çikolata",
      "sicak cikolata",
      "hot chocolate",
    ],
    allergens: ["dairy"],
  },
];

function addInferred(norm: string, out: Map<AllergenId, AllergenConfidence>) {
  const tokens = norm.trim().split(" ").filter(Boolean);
  const tables = [...INFERRED_DISHES, ...INFERRED_BEVERAGES];
  for (const dish of tables) {
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

function applyNegations(
  combined: string,
  out: Map<AllergenId, AllergenConfidence>,
  exclusions: Set<AllergenId>
) {
  if (GLUTEN_NEGATION.test(combined)) {
    out.delete("gluten");
    exclusions.add("gluten");
  }
  if (DAIRY_NEGATION.test(combined)) {
    out.delete("dairy");
    exclusions.add("dairy");
  }
  if (NUT_NEGATION.test(combined)) {
    out.delete("nuts");
    out.delete("peanuts");
    exclusions.add("nuts");
    exclusions.add("peanuts");
  }
  if (EGG_NEGATION.test(combined)) {
    out.delete("egg");
    exclusions.add("egg");
  }
  if (VEGAN_REGEX.test(combined)) {
    out.set("vegan", "explicit");
    out.delete("dairy");
    out.delete("egg");
    exclusions.add("dairy");
    exclusions.add("egg");
  }
  if (PLANT_MILK_REGEX.test(combined)) {
    out.delete("dairy");
    exclusions.add("dairy");
  }
  if (ALMOND_MILK_REGEX.test(combined) && !exclusions.has("nuts")) {
    if (!out.has("nuts")) out.set("nuts", "explicit");
  }
  if (SOY_MILK_REGEX.test(combined) && !exclusions.has("soy")) {
    if (!out.has("soy")) out.set("soy", "explicit");
  }
}

const ALLOWED = new Set<string>([
  ...EU_ALLERGEN_IDS,
  "seafood",
  "vegan",
  "spicy",
]);

const AI_ID_ALIASES: Record<string, AllergenId> = {
  milk: "dairy",
  tree_nuts: "nuts",
  treenuts: "nuts",
  seafood: "crustaceans",
  crustacean: "crustaceans",
  mollusk: "molluscs",
  mollusks: "molluscs",
  peanut: "peanuts",
  soybean: "soy",
  soybeans: "soy",
  sulphite: "sulphites",
  sulfite: "sulphites",
  sulfites: "sulphites",
};

export function canonicalizeAllergenId(raw: string): AllergenId | null {
  const key = raw.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_");
  const mapped = AI_ID_ALIASES[key] || (key as AllergenId);
  if (ALLOWED.has(mapped) && mapped !== "vegan" && mapped !== "spicy") {
    if (mapped === "seafood") return "crustaceans";
    return mapped;
  }
  if (mapped === "vegan" || mapped === "spicy") return mapped;
  return null;
}

export type AllergenSuggestInput = {
  name?: string | null;
  description?: string | null;
  categoryName?: string | null;
  name_en?: string | null;
  description_en?: string | null;
  name_ru?: string | null;
  description_ru?: string | null;
  menuCollectionName?: string | null;
};

export type DeterministicAllergenResult = {
  suggestions: AllergenSuggestion[];
  exclusions: AllergenId[];
  usedPlantMilk: boolean;
};

function partsFromInput(input: AllergenSuggestInput): string[] {
  return [
    input.name,
    input.description,
    input.categoryName,
    input.name_en,
    input.description_en,
    input.name_ru,
    input.description_ru,
    input.menuCollectionName,
  ].filter((p): p is string => Boolean(p && String(p).trim()));
}

function collectDeterministic(parts: string[]): DeterministicAllergenResult {
  const combined = parts.filter((p) => p && String(p).trim()).join("\n");
  if (!combined.trim()) {
    return { suggestions: [], exclusions: [], usedPlantMilk: false };
  }

  const norm = normalizePadded(combined);
  const out = new Map<AllergenId, AllergenConfidence>();
  const exclusions = new Set<AllergenId>();

  (Object.keys(KEYWORDS) as Exclude<AllergenId, "vegan">[]).forEach((id) => {
    addIfKeyword(norm, id, KEYWORDS[id], out);
  });
  addInferred(norm, out);
  applyNegations(combined, out, exclusions);

  if (out.has("seafood")) {
    if (!out.has("crustaceans")) out.set("crustaceans", out.get("seafood")!);
    out.delete("seafood");
  }

  const suggestions = Array.from(out.entries())
    .filter(([id]) => ALLOWED.has(id))
    .map(([id, confidence]) => ({
      id,
      confidence,
      reason: confidence === "inferred" ? "Ürün tipi nedeniyle tahmin" : undefined,
    }));

  return {
    suggestions,
    exclusions: [...exclusions],
    usedPlantMilk: PLANT_MILK_REGEX.test(combined),
  };
}

function collectSuggestions(parts: string[]): AllergenSuggestion[] {
  return collectDeterministic(parts).suggestions;
}

export function analyzeAllergensDeterministic(input: AllergenSuggestInput): DeterministicAllergenResult {
  return collectDeterministic(partsFromInput(input));
}

export function suggestAllergens(input: AllergenSuggestInput): AllergenSuggestion[] {
  return analyzeAllergensDeterministic(input).suggestions;
}

export function shouldCallAllergenAi(
  input: AllergenSuggestInput,
  deterministic: DeterministicAllergenResult
): boolean {
  const name = String(input.name || input.name_en || "").trim();
  if (!name) return false;
  if (deterministic.usedPlantMilk) return false;
  const core = deterministic.suggestions.filter((item) => !ALLERGEN_TAG_IDS.has(item.id));
  if (core.length > 0) return false;
  return true;
}

const CONFIDENCE_RANK: Record<AllergenConfidence, number> = {
  explicit: 2,
  inferred: 1,
};

export function mergeAllergenSuggestions(
  deterministic: AllergenSuggestion[],
  ai: AllergenSuggestion[],
  exclusions: Iterable<AllergenId>
): AllergenSuggestion[] {
  const excluded = new Set(exclusions);
  const map = new Map<AllergenId, AllergenSuggestion>();

  const take = (item: AllergenSuggestion) => {
    const id = canonicalizeAllergenId(item.id);
    if (!id || excluded.has(id)) return;
    if (ALLERGEN_TAG_IDS.has(id) && !deterministic.some((d) => d.id === id)) return;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, { ...item, id });
      return;
    }
    if (CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[prev.confidence]) {
      map.set(id, { ...item, id });
    }
  };

  for (const item of deterministic) take(item);
  for (const item of ai) take(item);
  for (const id of excluded) map.delete(id);

  return [...map.values()];
}

export function parseAllergenAiResponse(raw: unknown): AllergenSuggestion[] {
  if (!raw || typeof raw !== "object") return [];
  const suggestions = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];
  const out: AllergenSuggestion[] = [];
  const seen = new Set<AllergenId>();
  for (const row of suggestions) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { id?: unknown; confidence?: unknown; reason?: unknown };
    if (typeof rec.id !== "string") continue;
    const id = canonicalizeAllergenId(rec.id);
    if (!id || ALLERGEN_TAG_IDS.has(id) || seen.has(id)) continue;
    if (!EU_ALLERGEN_IDS.includes(id as EuAllergenId) && id !== "seafood") continue;
    const confidence: AllergenConfidence = rec.confidence === "explicit" ? "explicit" : "inferred";
    const reason = typeof rec.reason === "string" && rec.reason.trim() ? rec.reason.trim() : undefined;
    seen.add(id);
    out.push({ id, confidence, reason });
  }
  return out;
}

export async function runAllergenSuggestionPipeline(
  input: AllergenSuggestInput,
  inferWithAi?: (payload: AllergenSuggestInput) => Promise<AllergenSuggestion[]>
): Promise<AllergenSuggestion[]> {
  const deterministic = analyzeAllergensDeterministic(input);
  if (!inferWithAi || !shouldCallAllergenAi(input, deterministic)) {
    return deterministic.suggestions;
  }
  try {
    const ai = await inferWithAi(input);
    return mergeAllergenSuggestions(deterministic.suggestions, ai, deterministic.exclusions);
  } catch {
    return deterministic.suggestions;
  }
}

/**
 * Ürün metinlerinden olası alerjen / etiket id'lerini döndürür (tekrarsız).
 */
export function suggestAllergenIdsFromText(parts: string[]): string[] {
  return collectSuggestions(parts).map((item) => item.id);
}
