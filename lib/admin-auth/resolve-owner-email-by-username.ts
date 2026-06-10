import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLoginUsername } from "@/lib/admin-auth/login-username";
import { resolveOwnerEmail } from "@/lib/master-admin/restaurant-data";

/** login_username → owner e-posta (service role). */
export async function resolveOwnerEmailByLoginUsername(
  admin: SupabaseClient,
  rawUsername: string
): Promise<string | null> {
  const loginUsername = normalizeLoginUsername(rawUsername);
  if (!loginUsername) return null;

  const { data: restaurant, error } = await admin
    .from("restaurants")
    .select("owner_id")
    .eq("login_username", loginUsername)
    .maybeSingle();

  if (error || !restaurant?.owner_id) return null;
  return resolveOwnerEmail(admin, restaurant.owner_id);
}
