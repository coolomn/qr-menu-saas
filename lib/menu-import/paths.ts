/** İstemci yüklemeleri: menu-images bucket, path imports/{userId}/... */
export function expectedImportPrefix(userId: string) {
  return `imports/${userId}/`;
}

export function assertImportStoragePath(path: string, userId: string) {
  const prefix = expectedImportPrefix(userId);
  if (path.includes("..") || path.includes("//") || !path.startsWith(prefix)) {
    throw new Error("Geçersiz dosya yolu.");
  }
}
