/**
 * Faz 2.11a: schema.org JSON-LD üreticileri (saf fonksiyonlar, test edilebilir).
 * Metinler restoran sahibinden gelir → script içine basarken "<" kaçırılır (</script> kırılması/XSS yok).
 */
import { parseTryAmount } from "@/lib/currency/approx";
import {
  parseOpeningHours,
  resolveSocialLinks,
  sanitizeHttpUrl,
  WEEK_DAYS,
  type WeekDay,
} from "@/lib/public-menu/venue-info";

export type JsonLd = Record<string, unknown>;

/** <script type="application/ld+json"> içeriği: JSON + "<", ">", "&", U+2028/2029 kaçışlı. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Göreli/şemasız adresleri mutlak https adresine çevirir; geçersizse null. */
export function absoluteHttpUrl(raw: string | null | undefined, base: string): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const SCHEMA_DAY: Record<WeekDay, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function openingHoursSpec(raw: unknown): JsonLd[] | null {
  const hours = parseOpeningHours(raw);
  if (!hours) return null;
  const specs: JsonLd[] = [];
  for (const day of WEEK_DAYS) {
    const entry = hours[day];
    if (entry.closed) continue;
    // Açılış = kapanış (7/24 gibi) → tam gün.
    const sameTime = entry.open === entry.close;
    specs.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: SCHEMA_DAY[day],
      opens: sameTime ? "00:00" : entry.open,
      closes: sameTime ? "23:59" : entry.close,
    });
  }
  return specs.length > 0 ? specs : null;
}

function instagramUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(value)) {
    return `https://www.instagram.com/${encodeURIComponent(value.replace(/^@/, ""))}/`;
  }
  return sanitizeHttpUrl(value);
}

export type RestaurantLdInput = {
  name: string;
  /** Menünün asıl (canonical) adresi. */
  url: string;
  logoUrl?: string | null;
  instagram?: string | null;
  socialLinks?: unknown;
  openingHours?: unknown;
};

/** Menü sayfası: işletme kartı (Restaurant) + menüye bağlantı. */
export function buildRestaurantJsonLd(input: RestaurantLdInput): JsonLd {
  const sameAs = [
    instagramUrl(input.instagram),
    ...resolveSocialLinks(input.socialLinks).map((s) => s.url),
  ].filter((u): u is string => !!u);
  const image = absoluteHttpUrl(input.logoUrl, input.url);
  const hours = openingHoursSpec(input.openingHours);
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: input.name,
    url: input.url,
    hasMenu: input.url,
    ...(image ? { image } : {}),
    ...(sameAs.length > 0 ? { sameAs: [...new Set(sameAs)] } : {}),
    ...(hours ? { openingHoursSpecification: hours } : {}),
  };
}

export type MenuItemLdInput = {
  name: string;
  description?: string | null;
  /** Ürünün asıl (canonical) adresi. */
  url: string;
  imageUrl?: string | null;
  price?: string | null;
  variantPrices?: readonly (string | null | undefined)[];
  badges?: readonly string[];
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  soldOut?: boolean;
};

function priceString(n: number): string {
  return n.toFixed(2);
}

/**
 * "1,250" gibi tek virgülden sonra tam 3 hane: TR'de ondalık (1,25), İngilizce'de binlik (1250) olabilir.
 * Belirsiz fiyatı yayınlamayız (yanlış fiyat göstermektense hiç göstermemek).
 */
export function isAmbiguousPriceText(raw: string | null | undefined): boolean {
  const s = (raw ?? "").replace(/[^\d.,]/g, "");
  return /^\d{1,3},\d{3}$/.test(s);
}

function clearPrice(raw: string | null | undefined): number | null {
  if (isAmbiguousPriceText(raw)) return null;
  const n = parseTryAmount(raw);
  return n !== null && n > 0 ? n : null;
}

function offerFor(input: MenuItemLdInput): JsonLd | null {
  const availability = input.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock";
  // Boyutlu üründe products.price en düşük varyant fiyatına eşitlenir; menü arayüzü aralığı gösterir.
  // Bu yüzden varyant fiyatı varsa o esas alınır (yalnız en düşük fiyatı tek Offer diye yayınlamayız).
  const variantPrices = (input.variantPrices ?? [])
    .map((p) => clearPrice(p))
    .filter((p): p is number => p !== null);
  if (variantPrices.length > 0) {
    const low = Math.min(...variantPrices);
    const high = Math.max(...variantPrices);
    if (low === high) {
      return { "@type": "Offer", price: priceString(low), priceCurrency: "TRY", availability };
    }
    return {
      "@type": "AggregateOffer",
      lowPrice: priceString(low),
      highPrice: priceString(high),
      priceCurrency: "TRY",
      offerCount: variantPrices.length,
      availability,
    };
  }
  const single = clearPrice(input.price);
  if (single !== null) {
    return { "@type": "Offer", price: priceString(single), priceCurrency: "TRY", availability };
  }
  return null;
}

function nutritionFor(input: MenuItemLdInput): JsonLd | null {
  const out: JsonLd = { "@type": "NutritionInformation" };
  let any = false;
  if (typeof input.calories === "number" && input.calories > 0) {
    out.calories = `${Math.round(input.calories)} calories`;
    any = true;
  }
  const grams: [keyof MenuItemLdInput, string][] = [
    ["proteinG", "proteinContent"],
    ["carbsG", "carbohydrateContent"],
    ["fatG", "fatContent"],
  ];
  for (const [field, key] of grams) {
    const v = input[field];
    if (typeof v === "number" && v > 0) {
      out[key] = `${v} g`;
      any = true;
    }
  }
  return any ? out : null;
}

/** Ürün sayfası: MenuItem (fiyat, diyet, besin). MenuItem'ın restorana bağlayan alanı yok; ad sayfa başlığında. */
export function buildMenuItemJsonLd(input: MenuItemLdInput): JsonLd {
  const image = absoluteHttpUrl(input.imageUrl, input.url);
  const offer = offerFor(input);
  const nutrition = nutritionFor(input);
  const diets: string[] = [];
  const badges = new Set(input.badges ?? []);
  if (badges.has("vegan")) diets.push("https://schema.org/VeganDiet");
  if (badges.has("vegetarian") || badges.has("vegan")) diets.push("https://schema.org/VegetarianDiet");
  const description = input.description?.trim();
  return {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: input.name,
    url: input.url,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(offer ? { offers: offer } : {}),
    ...(nutrition ? { nutrition } : {}),
    ...(diets.length > 0 ? { suitableForDiet: diets } : {}),
  };
}
