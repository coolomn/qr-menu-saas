/** Private import bucket (geçici PDF/görsel; analiz sonrası silinir). */
export const MENU_IMPORTS_BUCKET = "menu-imports";

/** Legacy import dosyaları (geçiş dönemi fallback). */
export const LEGACY_IMPORT_BUCKET = "menu-images";

export function buildImportStoragePath(
  restaurantId: string,
  userId: string,
  safeFileName: string
): string {
  return `restaurants/${restaurantId}/imports/${userId}/${Date.now()}-${safeFileName}`;
}

export function expectedImportPrefix(restaurantId: string, userId: string): string {
  return `restaurants/${restaurantId}/imports/${userId}/`;
}

/** Eski istemci yüklemeleri: menu-images/imports/{userId}/... */
export function legacyImportPrefix(userId: string): string {
  return `imports/${userId}/`;
}

export function isLegacyImportPath(path: string, userId: string): boolean {
  return path.startsWith(legacyImportPrefix(userId));
}

function isSafeFileSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes("\\");
}

/**
 * Bu restoran + kullanıcıya ait tek seviyeli import dosyası:
 * restaurants/{restaurantId}/imports/{userId}/{dosya}
 * (buildImportStoragePath'in ürettiği biçim). Yol segment bazında kontrol edilir;
 * "menu..pdf" gibi adlar geçerlidir, ".." / "." segmentleri ve iç içe klasörler reddedilir.
 */
export function isOwnImportFilePath(path: string, restaurantId: string, userId: string): boolean {
  if (!path || !restaurantId || !userId) return false;
  const parts = path.split("/");
  return (
    parts.length === 5 &&
    parts[0] === "restaurants" &&
    parts[1] === restaurantId &&
    parts[2] === "imports" &&
    parts[3] === userId &&
    isSafeFileSegment(parts[4])
  );
}

export function assertImportStoragePath(
  path: string,
  restaurantId: string,
  userId: string
): void {
  if (isLegacyImportPath(path, userId)) {
    if (path.includes("..") || path.includes("//")) {
      throw new Error("Geçersiz dosya yolu.");
    }
    return;
  }
  if (!isOwnImportFilePath(path, restaurantId, userId)) {
    throw new Error("Geçersiz dosya yolu.");
  }
}

export function resolveImportDownloadTarget(
  storagePath: string,
  userId: string
): { bucket: string; path: string } {
  if (isLegacyImportPath(storagePath, userId)) {
    return { bucket: LEGACY_IMPORT_BUCKET, path: storagePath };
  }
  return { bucket: MENU_IMPORTS_BUCKET, path: storagePath };
}
