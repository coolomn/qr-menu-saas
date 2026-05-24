import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** İçe aktarma API’leri için. Eksik env’de throw etmez — çağıran 503 JSON döner. */
export function tryCreateServiceSupabase():
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url) {
    return {
      ok: false,
      error: "Sunucu yapılandırması eksik: NEXT_PUBLIC_SUPABASE_URL.",
    };
  }
  if (!key) {
    return {
      ok: false,
      error:
        "Sunucu yapılandırması eksik: SUPABASE_SERVICE_ROLE_KEY (menü içe aktarma sunucu tarafında gerekir).",
    };
  }
  return { ok: true, client: createClient(url, key) };
}
