import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLoginUsername } from "@/lib/admin-auth/login-username";
import { resolveOwnerEmail } from "@/lib/master-admin/restaurant-data";

/**
 * login_username → owner e-posta ve restoran id (service role).
 * Bulunamazsa null; veritabanı hatasında fırlatır (çağıran "hizmet yok" döner, "şifre yanlış" değil).
 */
export async function resolveOwnerEmailByLoginUsername(
  admin: SupabaseClient,
  rawUsername: string
): Promise<{ email: string; restaurantId: string } | null> {
  const loginUsername = normalizeLoginUsername(rawUsername);
  if (!loginUsername) return null;

  const { data: restaurant, error } = await admin
    .from("restaurants")
    .select("owner_id, id")
    .eq("login_username", loginUsername)
    .maybeSingle();

  if (error) throw new Error(`login_username lookup failed: ${error.message}`);
  if (!restaurant?.owner_id) return null;
  const email = await resolveOwnerEmail(admin, restaurant.owner_id);
  if (!email) return null;
  return { email, restaurantId: restaurant.id };
}
