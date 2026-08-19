const MENU_PUBLIC_BUCKET = "menu-public";

export function resolvePublicProductCardImageSrc(product: {
  thumbnail_url?: string | null;
  image_url?: string | null;
}): string | null {
  const thumb = product.thumbnail_url?.trim();
  if (thumb) return thumb;
  const original = product.image_url?.trim();
  return original || null;
}

/** Public URL → menu-public object path, only restaurants/{id}/products/*. */
export function publicProductStoragePathFromUrl(
  url: string,
  restaurantId: string
): string | null {
  const trimmed = url.trim();
  if (!trimmed || !restaurantId) return null;
  try {
    const parsed = new URL(trimmed);
    const marker = `/storage/v1/object/public/${MENU_PUBLIC_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    const path = decodeURIComponent(parsed.pathname.slice(index + marker.length));
    const prefix = `restaurants/${restaurantId}/products/`;
    if (!path.startsWith(prefix) || path.includes("..") || path.includes("//")) {
      return null;
    }
    return path;
  } catch {
    return null;
  }
}
