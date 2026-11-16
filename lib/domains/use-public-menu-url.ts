"use client";

import { useCallback, useSyncExternalStore } from "react";
import { publicMenuUrl, publicProductUrl } from "@/lib/domains/hosts";

const subscribeNoop = () => () => {};

/** Tarayıcıdaki alan adı; sunucu çiziminde null (hydration uyumsuzluğu olmaz). */
function useCurrentLocation(): { host: string; origin: string } | null {
  const host = useSyncExternalStore(
    subscribeNoop,
    () => window.location.hostname,
    () => null
  );
  return host === null ? null : { host, origin: window.location.origin };
}

/**
 * Paneldeki "menüyü gör" linkleri için: canlıda https://qr.tapmenu.com.tr/{slug},
 * önizleme/yerelde aynı sitedeki /menu/{slug}.
 */
export function usePublicMenuUrl(): (slug: string) => string {
  const location = useCurrentLocation();
  return useCallback(
    (slug: string) => publicMenuUrl(slug, location?.host ?? null, location?.origin ?? null),
    [location?.host, location?.origin]
  );
}

/** Ürün detay sayfasının adresi (paylaşım linki ve adres çubuğu için). */
export function usePublicProductUrl(): (slug: string, productId: string) => string {
  const location = useCurrentLocation();
  return useCallback(
    (slug: string, productId: string) =>
      publicProductUrl(slug, productId, location?.host ?? null, location?.origin ?? null),
    [location?.host, location?.origin]
  );
}
