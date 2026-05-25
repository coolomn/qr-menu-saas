import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";

export type RequireMasterAdminResult =
  | { ok: true; user: User; admin: SupabaseClient }
  | { ok: false; status: 401 | 403 | 503; error: string };

/** Bearer JWT doğrular; service role ile platform_admins kaydını kontrol eder. */
export async function requireMasterAdmin(request: Request): Promise<RequireMasterAdminResult> {
  const { user, error: authErr } = await getUserFromBearer(request);
  if (authErr || !user) {
    return { ok: false, status: 401, error: "Oturum gerekli." };
  }

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return { ok: false, status: 503, error: svc.error };
  }

  const { data: adminRow, error: adminErr } = await svc.client
    .from("platform_admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminErr) {
    console.error("platform_admins lookup failed:", adminErr);
    return { ok: false, status: 503, error: "Yetki kontrolü yapılamadı." };
  }

  if (!adminRow) {
    return { ok: false, status: 403, error: "Master admin yetkisi yok." };
  }

  return { ok: true, user, admin: svc.client };
}
