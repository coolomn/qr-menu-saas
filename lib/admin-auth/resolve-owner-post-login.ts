import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSelectedOwnerRestaurant } from "@/lib/admin-auth/owner-restaurants";

export type PostLoginDestination = "/admin" | "/admin/select-restaurant" | "/admin/master";

export async function resolveOwnerPostLoginPath(
  supabase: SupabaseClient,
  userId: string,
  preferredRestaurantId?: string | null
): Promise<"/admin" | "/admin/select-restaurant"> {
  const { restaurants, needsPicker } = await loadSelectedOwnerRestaurant(
    supabase,
    userId,
    preferredRestaurantId
  );

  if (restaurants.length === 0) {
    return "/admin";
  }

  return needsPicker ? "/admin/select-restaurant" : "/admin";
}

export async function resolvePostLoginDestination(
  supabase: SupabaseClient,
  accessToken: string,
  userId: string,
  preferredRestaurantId?: string | null
): Promise<PostLoginDestination> {
  try {
    const res = await fetch("/api/master/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return "/admin/master";
  } catch {
    // Ağ hatasında owner paneline düş
  }

  return resolveOwnerPostLoginPath(supabase, userId, preferredRestaurantId);
}
