/**
 * Faz 2.11c: şablonu restoranın menüsüne yükler.
 *
 * Güvenlik kuralları:
 * - YALNIZCA tamamen boş menüye (0 kategori ve 0 ürün) yüklenir; mevcut içeriğe asla dokunmaz.
 * - Eşzamanlı yükleme (iki sekme, çift tık) korunması: ilk kategorinin kimliği restoran kimliğinden
 *   türetilen SABİT bir değerdir. İki eşzamanlı toplu insert aynı birincil anahtarı yazmaya çalışır,
 *   ikincisi veritabanında 23505 ile reddedilir (şema değişikliği gerektirmez).
 * - Fiyat/alerjen/rozet boş gelir (bkz. templates.ts). "Taslak" işaretli kategoriler (ör. Bar) ve ürünleri
 *   yayında GELMEZ (is_active=false); işletme isterse yayına alır.
 * - İstemci (sahibin oturumu, RLS) ile yazılır: tenant ve abonelik kilidi kuralları aynen geçerli.
 * - Ürün yazımı başarısız olursa kategoriler geri alınır (ürün→kategori FK'si "restrict": önce ürünler silinir).
 *   Silme başarısız olursa bunu AÇIKÇA söyler (menüde yarım şablon kalmış olabilir).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATE_GROUPS, type MenuTemplate } from "./templates";

type Row = Record<string, unknown>;

export type TemplateCategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  main_group: string;
  translations: { en: { name: string; main_group: string } };
  sort_order: number;
  is_active: boolean;
};

export type TemplateProductRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string;
  translations: { en: { name: string; description: string } };
  price: "";
  allergens: string[];
  badges: string[];
  is_active: boolean;
  sort_order: number;
};

/**
 * Restoranın şablon "kök" kategori kimliği: restoran kimliğinin sürüm hanesi (14. karakter) '5' yapılır.
 * Rastgele (v4) kategori kimlikleriyle hiç çakışmaz, aynı restoran için hep aynıdır, başka restoranla karışmaz.
 */
export function templateRootCategoryId(restaurantId: string): string {
  return restaurantId.length === 36 ? `${restaurantId.slice(0, 14)}5${restaurantId.slice(15)}` : restaurantId;
}

export function buildTemplateRows(
  template: MenuTemplate,
  restaurantId: string,
  newId: () => string = () => crypto.randomUUID()
): { categories: TemplateCategoryRow[]; products: TemplateProductRow[] } {
  const categories: TemplateCategoryRow[] = [];
  const products: TemplateProductRow[] = [];

  template.categories.forEach((category, categoryIndex) => {
    const group = TEMPLATE_GROUPS[category.group];
    const categoryId = categoryIndex === 0 ? templateRootCategoryId(restaurantId) : newId();
    const published = category.draft !== true;
    categories.push({
      id: categoryId,
      restaurant_id: restaurantId,
      name: category.name,
      main_group: group.tr,
      translations: { en: { name: category.name_en, main_group: group.en } },
      sort_order: categoryIndex,
      is_active: published,
    });
    category.products.forEach((product, productIndex) => {
      products.push({
        id: newId(),
        restaurant_id: restaurantId,
        category_id: categoryId,
        name: product.name,
        description: product.description,
        translations: { en: { name: product.name_en, description: product.description_en } },
        price: "",
        allergens: [],
        badges: [],
        is_active: published,
        sort_order: productIndex,
      });
    });
  });

  return { categories, products };
}

export type ApplyTemplateResult =
  | { ok: true; categories: Row[]; products: Row[] }
  | {
      ok: false;
      reason: "not_empty" | "check_failed" | "insert_failed" | "rollback_failed";
      message: string;
    };

const MESSAGES = {
  not_empty: "Şablon yalnızca boş bir menüye yüklenebilir. Menünüzde zaten kategori veya ürün var.",
  check_failed: "Menünüzün boş olup olmadığı kontrol edilemedi. Lütfen tekrar deneyin.",
  insert_failed: "Şablon yüklenemedi, hiçbir değişiklik yapılmadı. Lütfen tekrar deneyin.",
  no_permission:
    "Bu menüye şablon yüklemek için yetkiniz yok ya da aboneliğiniz sona ermiş olabilir. Hiçbir değişiklik yapılmadı.",
  concurrent:
    "Bu menüye şu anda başka bir şablon yükleniyor ya da yüklendi. Sayfayı yenileyip menünüzü kontrol edin.",
  schema:
    "Sistem güncellemesi tamamlanmamış görünüyor, şablon yüklenemedi. Hiçbir değişiklik yapılmadı; lütfen destek ile iletişime geçin.",
  rollback_failed:
    "Şablon yüklenirken bir hata oluştu ve yapılan ekleme tamamen geri alınamadı. Menünüzde yarım bir şablon kalmış olabilir: Ürünler ve Kategoriler sekmelerini kontrol edip fazla olanları silin.",
} as const;

type DbError = { message?: string; code?: string } | null;

/** İnsert hatası → kullanıcıya anlaşılır mesaj (RLS/abonelik, eşzamanlı yükleme, eksik şema, diğerleri teknik ek ile). */
export function insertFailure(error: DbError): { reason: "not_empty" | "insert_failed"; message: string } {
  const text = error?.message ?? "";
  if (error?.code === "23505") return { reason: "not_empty", message: MESSAGES.concurrent };
  if (error?.code === "42501" || /row-level security|permission denied/i.test(text)) {
    return { reason: "insert_failed", message: MESSAGES.no_permission };
  }
  if (error?.code === "PGRST204" || error?.code === "42703" || /schema cache|column .* does not exist/i.test(text)) {
    return { reason: "insert_failed", message: MESSAGES.schema };
  }
  return { reason: "insert_failed", message: text ? `${MESSAGES.insert_failed} (${text})` : MESSAGES.insert_failed };
}

async function countRows(
  client: SupabaseClient,
  table: "categories" | "products",
  restaurantId: string
): Promise<number | null> {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  if (error || count === null) return null;
  return count;
}

export async function applyMenuTemplate(
  client: SupabaseClient,
  restaurantId: string,
  template: MenuTemplate,
  newId?: () => string
): Promise<ApplyTemplateResult> {
  const categoryCount = await countRows(client, "categories", restaurantId);
  const productCount = await countRows(client, "products", restaurantId);
  if (categoryCount === null || productCount === null) {
    return { ok: false, reason: "check_failed", message: MESSAGES.check_failed };
  }
  if (categoryCount > 0 || productCount > 0) {
    return { ok: false, reason: "not_empty", message: MESSAGES.not_empty };
  }

  const rows = buildTemplateRows(template, restaurantId, newId);

  // Not: kategori insert'i başarısız olursa GERİ ALMA DENENMEZ. 23505 (eşzamanlı yükleme) durumunda sabit
  // kök kimlik diğer yüklemenin satırıdır; silmek onun verisini bozardı.
  const { data: insertedCategories, error: categoryError } = await client
    .from("categories")
    .insert(rows.categories)
    .select();
  if (categoryError || !insertedCategories) {
    const failure = insertFailure(categoryError);
    return { ok: false, ...failure };
  }

  const { data: insertedProducts, error: productError } = await client
    .from("products")
    .insert(rows.products)
    .select("*, categories(*)");
  if (productError || !insertedProducts) {
    // Buraya gelindiyse kategori insert'i BİZİM çağrımızda başarılı oldu (eşzamanlı diğeri PK'de elenirdi):
    // satırlar bizimdir. Önce ürünler (kısmen yazılmış olabilir), sonra kategoriler; yalnız bu çağrının kimlikleri.
    const productDelete = await client
      .from("products")
      .delete()
      .eq("restaurant_id", restaurantId)
      .in("id", rows.products.map((r) => r.id));
    const categoryDelete = await client
      .from("categories")
      .delete()
      .eq("restaurant_id", restaurantId)
      .in("id", rows.categories.map((r) => r.id));
    if (productDelete.error || categoryDelete.error) {
      return { ok: false, reason: "rollback_failed", message: MESSAGES.rollback_failed };
    }
    const failure = insertFailure(productError);
    return { ok: false, ...failure };
  }

  const bySort = (a: Row, b: Row) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  return {
    ok: true,
    categories: [...(insertedCategories as Row[])].sort(bySort),
    products: [...(insertedProducts as Row[])].sort(bySort),
  };
}
