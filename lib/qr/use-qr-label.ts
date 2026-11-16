"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readLabelFromSearch, type QrLabel } from "./label";

const subscribe = () => () => {};

/**
 * Müşteri menüsünde QR adresindeki ?masa= / ?oda= bilgisi (yoksa null).
 * Sunucuda ve ilk çizimde null; tarayıcıda adres okunur. Yalnızca bilgi amaçlıdır.
 */
export function useQrLabel(): QrLabel | null {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => ""
  );
  return useMemo(() => readLabelFromSearch(search), [search]);
}
