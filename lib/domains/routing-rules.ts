import type { Redirect, Rewrite } from "next/dist/lib/load-custom-routes";
// next.config.ts bu dosyayı yükler: "@/" kısayolu orada çözülmeyebilir → göreli import.
import { HOST_SETS, type HostSet } from "./hosts";

/** Next "has.host" değeri ^…$ ile düzenli ifade olarak eşleşir → noktalar kaçırılmalı. */
function hostCondition(hostname: string) {
  return [{ type: "host" as const, value: hostname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }];
}

function redirectsForSet(set: HostSet): Redirect[] {
  // Geçiş döneminde tarayıcılar kalıcı olarak önbelleğe almasın diye geçici (307) yönlendirme.
  const permanent = false;
  const rules: Redirect[] = [];

  // Pazarlama sitesi: panel artık app alan adında. (Eski /menu/{slug} burada çalışmaya devam eder.)
  for (const marketingHost of set.marketing) {
    rules.push({
      source: "/admin/:path*",
      has: hostCondition(marketingHost),
      destination: `https://${set.app}/admin/:path*`,
      permanent,
    });
  }

  // Menü alan adı: panel burada açılmaz; kök adres pazarlama sitesine gider.
  rules.push(
    {
      source: "/admin/:path*",
      has: hostCondition(set.menu),
      destination: `https://${set.app}/admin/:path*`,
      permanent,
    },
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
  return sets.map((set) => ({
    source: "/:slug",
    has: hostCondition(set.menu),
    destination: "/menu/:slug",
  }));
}
