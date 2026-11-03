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

export function assertImportStoragePath(
  path: string,
  restaurantId: string,
  userId: string
): void {
  if (path.includes("..") || path.includes("//")) {
    throw new Error("Geçersiz dosya yolu.");
  }
  const newPrefix = expectedImportPrefix(restaurantId, userId);
  const legacyPrefix = legacyImportPrefix(userId);
  if (!path.startsWith(newPrefix) && !path.startsWith(legacyPrefix)) {
    throw new Error("Geçersiz dosya yolu.");
  }
}

/**
 * Sunucu tarafında silinebilecek import dosyası: yalnızca bu kullanıcının
 * restaurants/{restaurantId}/imports/{userId}/{dosya} klasöründeki tek seviyeli dosyalar.
 * DB'deki storage_path değiştirilmiş olsa bile başka kullanıcının dosyasına dokunulmaz.
 */
export function isDeletableImportPath(path: string, userId: string): boolean {
  if (!path || path.includes("..") || path.includes("//") || path.startsWith("/")) {
    return false;
  }
  const parts = path.split("/");
  return (
    parts.length === 5 &&
    parts[0] === "restaurants" &&
    parts[1].length > 0 &&
    parts[2] === "imports" &&
    parts[3] === userId &&
    parts[4].length > 0
  );
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
