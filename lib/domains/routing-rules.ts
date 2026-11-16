import type { Redirect, Rewrite } from "next/dist/lib/load-custom-routes";
// next.config.ts bu dosyayı yükler: "@/" kısayolu orada çözülmeyebilir → göreli import.
import { HOST_SETS, type HostSet } from "./hosts";

/** Next "has.host" değeri ^…$ ile düzenli ifade olarak eşleşir → noktalar kaçırılmalı. */
function hostCondition(hostname: string) {
  return [{ type: "host" as const, value: hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }];
}

/**
 * /admin ve alt sayfaları başka bir alan adına taşır.
 * Tek kural ("/admin/:path*") Vercel'de boş path için "/admin/" üretip fazladan bir
 * yönlendirmeye yol açıyordu → tam eşleşme ve alt sayfalar iki ayrı kural.
 */
function adminMoveRules(fromHost: string, appHost: string, permanent: boolean): Redirect[] {
  return [
    { source: "/admin", has: hostCondition(fromHost), destination: `https://${appHost}/admin`, permanent },
    {
      source: "/admin/:path+",
      has: hostCondition(fromHost),
      destination: `https://${appHost}/admin/:path+`,
      permanent,
    },
  ];
}

function redirectsForSet(set: HostSet): Redirect[] {
  // Geçiş döneminde tarayıcılar kalıcı olarak önbelleğe almasın diye geçici (307) yönlendirme.
  const permanent = false;
  const rules: Redirect[] = [];

  // Pazarlama sitesi: panel artık app alan adında. (Eski /menu/{slug} burada çalışmaya devam eder.)
  for (const marketingHost of set.marketing) {
    rules.push(...adminMoveRules(marketingHost, set.app, permanent));
  }

  // Menü alan adı: panel burada açılmaz; kök adres pazarlama sitesine gider.
  rules.push(...adminMoveRules(set.menu, set.app, permanent));
  rules.push(
    {
      source: "/",
      has: hostCondition(set.menu),
      destination: `https://${set.marketing[0]}/`,
      permanent,
    }
  );

  // Panel alan adı: kök → panel; menü burada açılmaz (panel ile aynı alan adında olmasın).
  rules.push(
    {
      source: "/",
      has: hostCondition(set.app),
      destination: "/admin",
      permanent,
    },
    {
      source: "/menu/:slug",
      has: hostCondition(set.app),
      destination: `https://${set.menu}/:slug`,
      permanent,
    },
    {
      source: "/menu/:slug/p/:productId",
      has: hostCondition(set.app),
      destination: `https://${set.menu}/:slug/p/:productId`,
      permanent,
    }
  );

  return rules;
}

export function buildDomainRedirects(sets: readonly HostSet[] = HOST_SETS): Redirect[] {
  return sets.flatMap(redirectsForSet);
}

/**
 * qr…/{slug} → /menu/{slug} (adres çubuğu kısa kalır).
 * afterFiles: önce gerçek dosyalar/sayfalar (favicon, /monitoring, /api/…) kontrol edilir,
 * yalnızca eşleşmeyen tek parçalı yollar menüye yönlenir.
 */
export function buildDomainAfterFilesRewrites(sets: readonly HostSet[] = HOST_SETS): Rewrite[] {
  return sets.flatMap((set) => [
    {
      source: "/:slug",
      has: hostCondition(set.menu),
      destination: "/menu/:slug",
    },
    // Ürün detay sayfası: qr…/{slug}/p/{ürün} → /menu/{slug}/p/{ürün}
    {
      source: "/:slug/p/:productId",
      has: hostCondition(set.menu),
      destination: "/menu/:slug/p/:productId",
    },
  ]);
}
