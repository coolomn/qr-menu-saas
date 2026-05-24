/**
 * İstemci tarafı alerjen önerisi (sabit anahtar kelimeler, ağ çağrısı yok).
 * Tıbbi veya hukuki garanti değildir; yanlış pozitif/negatif olabilir.
 */

export type AllergenId = "gluten" | "dairy" | "nuts" | "seafood" | "egg" | "vegan" | "spicy";

/** Tüm harfleri koru (Kiril vb.); kelime sınırı için boşlukla pad'leriz. */
function normalizePadded(text: string): string {
  const lowered = text.toLocaleLowerCase("tr-TR");
  const spaced = lowered.replace(/[^\p{L}\p{N}]+/gu, " ");
  return ` ${spaced.replace(/\s+/g, " ").trim()} `;
}

const GLUTEN_NEGATION = /glütensiz|glutensiz|gluten\s*free|\bgf\b/i;

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
    "deniz ürünü",
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

function addIfKeyword(norm: string, id: AllergenId, words: string[], out: Set<string>) {
  for (const w of words) {
    const t = w.toLocaleLowerCase("tr-TR").trim();
    if (t.length < 2) continue;
    if (norm.includes(` ${t} `)) {
      out.add(id);
      return;
    }
  }
}

const ALLOWED = new Set<string>([
  "gluten",
  "dairy",
  "nuts",
  "seafood",
  "egg",
  "vegan",
  "spicy",
]);

/**
 * Ürün metinlerinden olası alerjen / etiket id'lerini döndürür (tekrarsız).
 * Çağıran taraf tüm görünür metinleri `parts` içinde birleştirmeli (ör. ürün adı + TR/EN/RU açıklamaları).
 */
export function suggestAllergenIdsFromText(parts: string[]): string[] {
  const combined = parts.filter((p) => p && String(p).trim()).join("\n");
  if (!combined.trim()) return [];

  const norm = normalizePadded(combined);
  const out = new Set<string>();

  (Object.keys(KEYWORDS) as Exclude<AllergenId, "vegan">[]).forEach((id) => {
    addIfKeyword(norm, id, KEYWORDS[id], out);
  });

  if (GLUTEN_NEGATION.test(combined)) {
    out.delete("gluten");
  }

  if (VEGAN_REGEX.test(combined)) {
    out.add("vegan");
  }

  return Array.from(out).filter((id) => ALLOWED.has(id));
}
