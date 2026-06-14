const STORAGE_PREFIX = "tapmenu:ownerSelectedRestaurantId:";

function storageKey(ownerUserId: string): string {
  return `${STORAGE_PREFIX}${ownerUserId}`;
}

export function getStoredRestaurantId(ownerUserId: string): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(ownerUserId));
  const trimmed = raw?.trim();
  return trimmed || null;
}

export function setStoredRestaurantId(ownerUserId: string, restaurantId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(ownerUserId), restaurantId);
}

export function clearStoredRestaurantId(ownerUserId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(ownerUserId));
}
