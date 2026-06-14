import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearStoredRestaurantId,
  getStoredRestaurantId,
  setStoredRestaurantId,
} from "@/lib/admin-auth/owner-restaurant-selection";

export type OwnerRestaurantSummary = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
};

export async function listOwnerRestaurantsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<OwnerRestaurantSummary[]> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url")
    .eq("owner_id", userId)
    .order("name");

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as OwnerRestaurantSummary[];
}

export function resolveSelectedRestaurantFromList(
  restaurants: OwnerRestaurantSummary[],
  ownerUserId: string,
  preferredId?: string | null
): { selected: OwnerRestaurantSummary | null; needsPicker: boolean } {
  if (restaurants.length === 0) {
    return { selected: null, needsPicker: false };
  }

  if (restaurants.length === 1) {
    setStoredRestaurantId(ownerUserId, restaurants[0].id);
    return { selected: restaurants[0], needsPicker: false };
  }

  const pickById = (id: string | null | undefined): OwnerRestaurantSummary | null => {
    if (!id) return null;
    return restaurants.find((r) => r.id === id) ?? null;
  };

  const preferred = pickById(preferredId);
  if (preferred) {
    setStoredRestaurantId(ownerUserId, preferred.id);
    return { selected: preferred, needsPicker: false };
  }

  const stored = pickById(getStoredRestaurantId(ownerUserId));
  if (stored) {
    return { selected: stored, needsPicker: false };
  }

  clearStoredRestaurantId(ownerUserId);
  return { selected: null, needsPicker: true };
}

export async function loadSelectedOwnerRestaurant(
  supabase: SupabaseClient,
  userId: string,
  preferredId?: string | null
): Promise<{
  restaurants: OwnerRestaurantSummary[];
  selected: OwnerRestaurantSummary | null;
  needsPicker: boolean;
}> {
  const restaurants = await listOwnerRestaurantsForUser(supabase, userId);
  const { selected, needsPicker } = resolveSelectedRestaurantFromList(
    restaurants,
    userId,
    preferredId
  );
  return { restaurants, selected, needsPicker };
}

export async function loadOwnerRestaurantById(
  supabase: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("*")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}
