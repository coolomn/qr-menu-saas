/**
 * Alan adı yapısı (Faz 2.0):
 * - pazarlama sitesi: tapmenu.com.tr (basılı QR'lar için eski /menu/{slug} burada sonsuza dek çalışır)
 * - yönetim paneli:   app.tapmenu.com.tr
 * - müşteri menüsü:   qr.tapmenu.com.tr/{slug}
 *
 * Panel ile menü ayrı alan adlarında olduğu için tarayıcı ikisini birbirinden yalıtır:
 * menü sayfasındaki olası bir sorun panel oturumuna (localStorage) erişemez.
 */
export type HostSet = {
  /** Pazarlama sitesi alan adları; ilk eleman asıl adres. */
  marketing: readonly [string, ...string[]];
  /** Restoran yönetim paneli. */
  app: string;
  /** Müşterinin gördüğü menü: https://{menu}/{slug} */
  menu: string;
};

export const PRODUCTION_HOST_SET: HostSet = {
  marketing: ["tapmenu.com.tr", "www.tapmenu.com.tr"],
  app: "app.tapmenu.com.tr",
  menu: "qr.tapmenu.com.tr",
};

/**
 * Önizleme (preview) dağıtımını gerçek alan adı kurallarıyla denemek için geçici takma adlar.
 * Yalnızca test sırasında bir preview'a bağlanır; canlıda hiçbir şeye bağlı değildir.
 */
export const TEST_HOST_SET: HostSet = {
  marketing: ["site-test.tapmenu.com.tr"],
  app: "app-test.tapmenu.com.tr",
  menu: "qr-test.tapmenu.com.tr",
};

export const HOST_SETS: readonly HostSet[] = [PRODUCTION_HOST_SET, TEST_HOST_SET];

/** "App.TapMenu.com.tr:443." → "app.tapmenu.com.tr" */
export function normalizeHostname(host: string | null | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function findHostSet(host: string | null | undefined): HostSet | null {
  const hostname = normalizeHostname(host);
  if (!hostname) return null;
  return (
    HOST_SETS.find(
      (set) => set.app === hostname || set.menu === hostname || set.marketing.includes(hostname)
    ) ?? null
  );
}

function encodeSlug(slug: string): string {
  return encodeURIComponent(slug.trim());
}

/**
 * Restoranın müşteri menüsü adresi.
 * Bilinen bir alan adındaysak (canlı veya test) → https://qr…/{slug}.
 * Yerel geliştirme / Vercel önizleme adresinde → aynı sitedeki /menu/{slug} (orada qr alan adı yok).
 */
export function publicMenuUrl(
  slug: string,
  currentHost: string | null | undefined,
  currentOrigin?: string | null
): string {
  const set = findHostSet(currentHost);
  if (set) return `https://${set.menu}/${encodeSlug(slug)}`;
  const origin = currentOrigin?.replace(/\/$/, "") ?? "";
  return `${origin}/menu/${encodeSlug(slug)}`;
}

/** Arama motorlarına bildirilen asıl menü adresi (her zaman canlı qr alan adı). */
export function canonicalMenuUrl(slug: string): string {
  return `https://${PRODUCTION_HOST_SET.menu}/${encodeSlug(slug)}`;
}

/** Ürün detay adresi: menü adresinin altında /p/{ürün-id} (Faz 2.2). */
export function publicProductUrl(
  slug: string,
  productId: string,
  currentHost: string | null | undefined,
  currentOrigin?: string | null
): string {
  return `${publicMenuUrl(slug, currentHost, currentOrigin)}/p/${encodeURIComponent(productId)}`;
}

/** Arama motorlarına bildirilen asıl ürün adresi. */
export function canonicalProductUrl(slug: string, productId: string): string {
  return `${canonicalMenuUrl(slug)}/p/${encodeURIComponent(productId)}`;
}
