import type { SupabaseClient } from "@supabase/supabase-js";
import { isDeletableImportPath, isLegacyImportPath, MENU_IMPORTS_BUCKET } from "./paths";

export async function cleanupImportFile(
  admin: SupabaseClient,
  storagePath: string,
  userId: string
): Promise<void> {
  if (isLegacyImportPath(storagePath, userId)) {
    return;
  }
  if (!isDeletableImportPath(storagePath, userId)) {
    console.error("Import file cleanup skipped: path outside user import folder");
    return;
  }
  const { error } = await admin.storage.from(MENU_IMPORTS_BUCKET).remove([storagePath]);
  if (error) {
    console.error("Import file cleanup failed:", storagePath, error.message);
  }
}
