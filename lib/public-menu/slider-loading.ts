export const SLIDER_AUTOPLAY_MS = 3000;
export const SLIDER_FADE_MS = 1000;

export function shouldRenderPublicSlider(images: readonly string[]): boolean {
  return images.length > 0;
}

export function shouldAutoplayPublicSlider(images: readonly string[]): boolean {
  return images.length > 1;
}

export function wrapSlideIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

/** Aktif slayttan sonraki ilk başarısız olmayan index. */
export function getNextValidSlideIndex(
  activeIndex: number,
  length: number,
  failedIndexes: ReadonlySet<number>
): number | null {
  if (length <= 1) return null;
  for (let step = 1; step < length; step++) {
    const candidate = wrapSlideIndex(activeIndex + step, length);
    if (!failedIndexes.has(candidate)) return candidate;
  }
  return null;
}

/** İlk açılış / aktif slayt değişiminde preload edilecek index (yalnızca bir sonraki geçerli). */
export function getPreloadSlideIndex(
  activeIndex: number,
  length: number,
  failedIndexes: ReadonlySet<number>
): number | null {
  return getNextValidSlideIndex(activeIndex, length, failedIndexes);
}

/** İlk mount'ta network'e gidecek indexler: aktif + (varsa) bir sonraki. */
export function getInitialSlideLoadIndexes(
  length: number,
  failedIndexes: ReadonlySet<number> = new Set()
): number[] {
  if (length <= 0) return [];
  if (length === 1) return failedIndexes.has(0) ? [] : [0];
  const active = failedIndexes.has(0) ? getNextValidSlideIndex(0, length, failedIndexes) : 0;
  if (active == null) return [];
  const preload = getPreloadSlideIndex(active, length, failedIndexes);
  if (preload == null) return [active];
  return active === preload ? [active] : [active, preload];
}

/** Autoplay yalnızca bir sonraki geçerli slayt preload edildiyse ilerler. */
export function resolveAutoplaySlideIndex(
  activeIndex: number,
  length: number,
  loadedIndexes: ReadonlySet<number>,
  failedIndexes: ReadonlySet<number>
): number {
  if (length <= 1) return activeIndex;
  const next = getNextValidSlideIndex(activeIndex, length, failedIndexes);
  if (next == null) return activeIndex;
  if (!loadedIndexes.has(next)) return activeIndex;
  return next;
}

/** DOM'da tutulacak slaytlar: aktif + preload edilmiş sonraki (fade için). */
export function getMountedSlideIndexes(
  activeIndex: number,
  length: number,
  loadedIndexes: ReadonlySet<number>,
  failedIndexes: ReadonlySet<number>
): number[] {
  if (length <= 0) return [];
  const mounted = new Set<number>();
  if (!failedIndexes.has(activeIndex)) mounted.add(activeIndex);
  const preload = getPreloadSlideIndex(activeIndex, length, failedIndexes);
  if (preload != null && loadedIndexes.has(preload)) mounted.add(preload);
  return [...mounted].sort((a, b) => a - b);
}

/** Fade sonrası DOM temizliği: aktif + bir sonraki preload (varsa). */
export function pruneMountedSlideIndexes(
  activeIndex: number,
  length: number,
  loadedIndexes: ReadonlySet<number>,
  failedIndexes: ReadonlySet<number>,
  mountedIndexes: readonly number[]
): number[] {
  return getMountedSlideIndexes(activeIndex, length, loadedIndexes, failedIndexes);
}

/** Aktif slayt başarısız olunca geçilecek index (yüklenmiş veya preload bekleyen). */
export function resolveActiveAfterSlideError(
  failedIndex: number,
  length: number,
  loadedIndexes: ReadonlySet<number>,
  failedIndexes: ReadonlySet<number>
): number | null {
  if (length <= 0) return null;
  for (let step = 1; step <= length; step++) {
    const candidate = wrapSlideIndex(failedIndex + step, length);
    if (failedIndexes.has(candidate)) continue;
    if (loadedIndexes.has(candidate)) return candidate;
    return candidate;
  }
  return null;
}

/** Network planı: yalnızca bir sonraki slayt Image() ile preload edilir (aktif DOM img ile yüklenir). */
export function getPendingSlidePreloadIndex(
  length: number,
  activeIndex: number,
  loadedIndexes: ReadonlySet<number>,
  failedIndexes: ReadonlySet<number>,
  inFlightIndexes: ReadonlySet<number>
): number | null {
  if (length <= 1) return null;
  const preload = getPreloadSlideIndex(activeIndex, length, failedIndexes);
  if (preload == null) return null;
  if (failedIndexes.has(preload) || loadedIndexes.has(preload) || inFlightIndexes.has(preload)) {
    return null;
  }
  return preload;
}

/** Kaç benzersiz görsel isteği başlatılmalı (ilk açılış simülasyonu). */
export function countInitialNetworkRequests(
  length: number,
  failedIndexes: ReadonlySet<number> = new Set()
): number {
  return getInitialSlideLoadIndexes(length, failedIndexes).length;
}
