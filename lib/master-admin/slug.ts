export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function normalizeSlugInput(slug: string): string {
  return slugifyName(slug.replace(/\s+/g, "-"));
}

/**
 * Restoran adresi (slug) olarak kullanılamayacak isimler.
 * qr.tapmenu.com.tr/{slug} kısa adresi, aynı adlı gerçek sayfa/dosya varsa ona yenik düşer;
 * ileride eklenecek site sayfaları (fiyatlandırma, kayıt…) da restoran adresini gölgeler.
 * Yeni bir üst seviye sayfa eklerken bu listeye ekleyin ve mevcut slug'larla çakışmadığını kontrol edin.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // mevcut uygulama yolları
  "admin", "api", "menu", "monitoring",
  // alan adları / altyapı
  "app", "qr", "www", "static", "assets", "public", "brand", "fonts", "images", "img",
  "robots", "sitemap", "favicon", "manifest", "icon", "apple-icon", "opengraph-image",
  "auth", "master", "dashboard", "panel", "tapmenu", "error", "not-found",
  // ileride eklenecek site sayfaları
  "login", "giris", "logout", "cikis", "signup", "register", "kayit", "kaydol",
  "fiyatlandirma", "fiyatlar", "pricing", "ozellikler", "features", "iletisim", "contact",
  "hakkimizda", "about", "blog", "sss", "faq", "destek", "support", "yardim", "help",
  "gizlilik", "privacy", "kvkk", "cerez-politikasi", "cookies", "kullanim-sartlari", "terms",
  "mesafeli-satis-sozlesmesi", "on-bilgilendirme", "iade", "bayi", "demo", "ornek",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

export const RESERVED_SLUG_ERROR = "Bu adres sistem tarafından kullanılıyor; başka bir adres seçin.";
