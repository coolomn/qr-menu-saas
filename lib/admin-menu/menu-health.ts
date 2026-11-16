/**
 * Faz 2.11b: menü sağlık skoru. Saf hesaplama (test edilebilir); arayüz app/admin/_components/health/.
 * Müşterinin gördüğü (aktif) ürünler üzerinden: fotoğraf, açıklama, fiyat, çeviri ve işletme bilgileri
 * ne kadar dolu? 100 = hiçbir eksik yok (yuvarlama eksiği gizlemez: aşağı yuvarlanır).
 * Alerjen kartı bilgi amaçlıdır, SKORA GİRMEZ: veride "alerjeni yok" işareti olmadığından (su, çay…)
 * boş alerjen "eksik" demek değildir; skora katsaydık kullanıcıyı yanlış veri girmeye iterdik.
 */
import { missingTranslationFields, translationsFromRow } from "@/lib/i18n/edit-translations";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import { dropHiddenSubcategories } from "@/lib/public-menu/category-tree";
import { resolveAllergen } from "@/lib/public-menu/allergens";
import { parsePriceNumber } from "@/lib/public-menu/menu-filters";

export type HealthCheckId = "photo" | "description" | "price" | "translations" | "allergens" | "venue";
/** Eksikleri düzeltmek için gidilecek yer. */
export type HealthFixTarget = "product" | "languages" | "settings";

export type HealthCheck = {
  id: HealthCheckId;
  label: string;
  /** Skora katkı ağırlığı (skorlu kontrollerde toplam 100; bilgi kartında 0). */
  weight: number;
  /** false = yalnız bilgi kartı, skora girmez. */
  scored: boolean;
  filled: number;
  total: number;
  /** 0–100, aşağı yuvarlanır. */
  percent: number;
  /** Eksiği olan aktif ürünler (venue için boş). */
  missingProductIds: string[];
  /** Bu kontrol %100 olsaydı skora eklenecek puan (toplam ağırlığa göre normalize). */
  potentialGain: number;
  fixTarget: HealthFixTarget;
  /** Birim: "ürün" | "alan" | "bilgi". */
  unit: string;
  hint: string;
};

export type HealthGrade = "excellent" | "good" | "fair" | "poor";

export type MenuHealth = {
  /** Aktif ürün yoksa null. */
  score: number | null;
  grade: HealthGrade | null;
  productCount: number;
  checks: HealthCheck[];
  /** İçinde (alt kategorileri dahil) hiç aktif ürün olmayan aktif kategoriler. */
  emptyCategories: { id: string; name: string }[];
};

type Row = Record<string, unknown>;

export type MenuHealthInput = {
  products: Row[];
  /** product_id → varyantlar (price, is_active). */
  variantsByProduct: Record<string, Row[]>;
  categories: Row[];
  /** Menüde açık çeviri dilleri (TR hariç). */
  translationLanguages: readonly TranslationLanguage[];
  venue: { hasLogo: boolean; hasOpeningHours: boolean; hasContact: boolean };
};

const WEIGHTS: Record<HealthCheckId, number> = {
  photo: 30,
  description: 25,
  price: 20,
  translations: 15,
  allergens: 0,
  venue: 10,
};

/** allergens dizisi diyet etiketlerini (vegan, acı) de taşır; bunlar alerjen sayılmaz. */
const NON_ALLERGEN_IDS = new Set(["vegan", "spicy"]);

export const DESCRIPTION_MIN_LENGTH = 10;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function gradeForScore(score: number): HealthGrade {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

export const GRADE_LABELS: Record<HealthGrade, string> = {
  excellent: "Mükemmel",
  good: "İyi",
  fair: "Geliştirilebilir",
  poor: "Zayıf",
};

function percentOf(filled: number, total: number): number {
  return total === 0 ? 100 : Math.floor((filled / total) * 100);
}

/**
 * Müşteri menüsünde görünen kategoriler: aktif olanlar; üst kategorisi aktif olmayan (kapalı/yok) alt kategori
 * müşteride de gizlenir (lib/public-menu/category-tree.ts dropHiddenSubcategories ile aynı kural).
 */
function visibleCategoryRows(categories: Row[]): Row[] {
  const active = categories.filter((c) => c.is_active !== false);
  const kept = new Set(
    dropHiddenSubcategories(active.map((c) => ({ id: str(c.id), parent_id: str(c.parent_id) || null }))).map((c) => c.id)
  );
  return active.filter((c) => kept.has(str(c.id)));
}

/** Müşteri menüsünde görünen ürünler: aktif ürün + görünür kategori (kategorisi listede yoksa görünür sayılır). */
function visibleProducts(products: Row[], categories: Row[]): Row[] {
  const visible = new Set(visibleCategoryRows(categories).map((c) => str(c.id)));
  const known = new Set(categories.map((c) => str(c.id)));
  return products.filter((p) => {
    if (p.is_active === false) return false;
    const categoryId = str(p.category_id);
    return !known.has(categoryId) || visible.has(categoryId);
  });
}

function hasPhoto(p: Row): boolean {
  return !!(str(p.thumbnail_url) || str(p.image_url));
}

/** En az bir GERÇEK alerjen (vegan/acı etiketleri ve tanınmayan eski metinler sayılmaz). */
function hasRealAllergen(p: Row): boolean {
  if (!Array.isArray(p.allergens)) return false;
  return p.allergens.some((a) => {
    if (typeof a !== "string") return false;
    const resolved = resolveAllergen(a, "tr");
    return !!resolved && !NON_ALLERGEN_IDS.has(resolved.id);
  });
}

function hasPrice(p: Row, variants: Row[]): boolean {
  const activeVariants = variants.filter((v) => v.is_active !== false);
  // Varyantlı üründe her aktif seçeneğin fiyatı olmalı (boş fiyatlı seçenek müşteride görünür).
  if (activeVariants.length > 0) return activeVariants.every((v) => parsePriceNumber(str(v.price)) !== null);
  return parsePriceNumber(str(p.price)) !== null;
}

function emptyCategoryList(categories: Row[], products: Row[]): { id: string; name: string }[] {
  const active = visibleCategoryRows(categories);
  const withProducts = new Set(products.map((p) => str(p.category_id)));
  // Alt kategorideki ürün üst kategoriyi de dolu yapar.
  const parentOf = new Map(active.map((c) => [str(c.id), str(c.parent_id)]));
  const filled = new Set(withProducts);
  for (const id of withProducts) {
    let parent = parentOf.get(id);
    let guard = 0;
    while (parent && guard++ < 5) {
      filled.add(parent);
      parent = parentOf.get(parent);
    }
  }
  return active
    .filter((c) => !filled.has(str(c.id)))
    .map((c) => ({ id: str(c.id), name: str(c.name) || "(adsız kategori)" }));
}

export function computeMenuHealth(input: MenuHealthInput): MenuHealth {
  const products = visibleProducts(input.products, input.categories);
  const emptyCategories = emptyCategoryList(input.categories, products);
  if (products.length === 0) {
    return { score: null, grade: null, productCount: 0, checks: [], emptyCategories };
  }

  const missing = {
    photo: [] as string[],
    description: [] as string[],
    price: [] as string[],
    translations: [] as string[],
    allergens: [] as string[],
  };
  let translationFields = 0;
  let translationMissingFields = 0;

  for (const p of products) {
    const id = str(p.id);
    if (!hasPhoto(p)) missing.photo.push(id);
    if (str(p.description).length < DESCRIPTION_MIN_LENGTH) missing.description.push(id);
    if (!hasPrice(p, input.variantsByProduct[id] ?? [])) missing.price.push(id);
    if (!hasRealAllergen(p)) missing.allergens.push(id);

    const source = { name: str(p.name), description: str(p.description) };
    const sourceFieldCount = Object.values(source).filter(Boolean).length;
    const translations = translationsFromRow(p, ["name", "description"]);
    let productMissing = 0;
    for (const lang of input.translationLanguages) {
      translationFields += sourceFieldCount;
      productMissing += missingTranslationFields(source, translations, lang).length;
    }
    translationMissingFields += productMissing;
    if (productMissing > 0) missing.translations.push(id);
  }

  const n = products.length;
  const venueDone = [input.venue.hasLogo, input.venue.hasOpeningHours, input.venue.hasContact].filter(Boolean).length;

  const raw: Omit<HealthCheck, "potentialGain">[] = [
    {
      id: "photo",
      scored: true,
      label: "Ürün fotoğrafı",
      weight: WEIGHTS.photo,
      filled: n - missing.photo.length,
      total: n,
      percent: percentOf(n - missing.photo.length, n),
      missingProductIds: missing.photo,
      fixTarget: "product",
      unit: "ürün",
      hint: "Fotoğraflı ürünler müşteride daha çok ilgi görür.",
    },
    {
      id: "description",
      scored: true,
      label: "Ürün açıklaması",
      weight: WEIGHTS.description,
      filled: n - missing.description.length,
      total: n,
      percent: percentOf(n - missing.description.length, n),
      missingProductIds: missing.description,
      fixTarget: "product",
      unit: "ürün",
      hint: `En az ${DESCRIPTION_MIN_LENGTH} karakterlik açıklama (içerik, porsiyon, pişirme) sayılır.`,
    },
    {
      id: "price",
      scored: true,
      label: "Fiyat",
      weight: WEIGHTS.price,
      filled: n - missing.price.length,
      total: n,
      percent: percentOf(n - missing.price.length, n),
      missingProductIds: missing.price,
      fixTarget: "product",
      unit: "ürün",
      hint: "Net bir fiyat yazılmayan ürün (boş ya da sayı olmayan) eksik sayılır.",
    },
    {
      id: "translations",
      scored: true,
      label: "Çeviri",
      weight: WEIGHTS.translations,
      filled: translationFields - translationMissingFields,
      total: translationFields,
      percent: percentOf(translationFields - translationMissingFields, translationFields),
      missingProductIds: missing.translations,
      fixTarget: "languages",
      unit: "alan",
      hint: "Menüde açık her dil için ürün adı ve açıklaması. 'Dil, Çeviri & Döviz' sekmesinde AI ile doldurabilirsiniz.",
    },
    {
      id: "allergens",
      scored: false,
      label: "Alerjen kontrolü",
      weight: WEIGHTS.allergens,
      filled: n - missing.allergens.length,
      total: n,
      percent: percentOf(n - missing.allergens.length, n),
      missingProductIds: missing.allergens,
      fixTarget: "product",
      unit: "ürün",
      hint: "Alerjen işaretlenmemiş ürünleri gözden geçirin. Su, çay gibi alerjensiz ürünlerde boş kalması normaldir; bu kart skora girmez.",
    },
    {
      id: "venue",
      scored: true,
      label: "İşletme bilgileri",
      weight: WEIGHTS.venue,
      filled: venueDone,
      total: 3,
      percent: percentOf(venueDone, 3),
      missingProductIds: [],
      fixTarget: "settings",
      unit: "bilgi",
      hint: "Logo, çalışma saatleri ve bir iletişim yolu (WhatsApp, Instagram ya da Google yorum linki).",
    },
  ];

  // Ürünü olmayan alan (ör. çevrilecek metin yok) puanı etkilemesin: total 0 olanlar hesaptan çıkar.
  const scored = raw.filter((c) => c.scored && c.total > 0);
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.floor(scored.reduce((sum, c) => sum + c.weight * c.percent, 0) / totalWeight);
  const checks: HealthCheck[] = raw.map((c) => ({
    ...c,
    potentialGain: c.scored && c.total > 0 ? Math.round((c.weight * (100 - c.percent)) / totalWeight) : 0,
  }));

  return { score, grade: gradeForScore(score), productCount: n, checks, emptyCategories };
}

/** Skora en çok katkı yapacak, eksiği olan kontroller (en çok kazandıran önce). */
export function topImprovements(health: MenuHealth, limit = 3): HealthCheck[] {
  return health.checks
    .filter((c) => c.potentialGain > 0)
    .sort((a, b) => b.potentialGain - a.potentialGain || b.weight - a.weight)
    .slice(0, limit);
}
