import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnImportFilePath, MENU_IMPORTS_BUCKET } from "./paths";

/**
 * Import dosyasını siler. Yalnızca restaurants/{restaurantId}/imports/{userId}/{dosya}
 * biçimindeki yollar silinir; DB'deki yol başka restoran/kullanıcıyı gösteriyorsa dokunulmaz.
 */
export async function cleanupImportFile(
  admin: SupabaseClient,
  storagePath: string,
  restaurantId: string,
  userId: string
): Promise<void> {
  if (!isOwnImportFilePath(storagePath, restaurantId, userId)) {
    console.error("Import file cleanup skipped: path outside restaurant/user import folder");
    return;
  }
  const { error } = await admin.storage.from(MENU_IMPORTS_BUCKET).remove([storagePath]);
  if (error) {
    console.error("Import file cleanup failed:", storagePath, error.message);
  }
}
