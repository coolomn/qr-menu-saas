import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listMenuCollectionsForRestaurantPicker,
  validateMenuCollectionIdsForRestaurant,
} from "@/lib/admin-menu/helpers";

export type ResolvedImportTargetMenu = {
  id: string;
  name: string;
};

export async function resolveImportTargetMenuCollection(
  admin: SupabaseClient,
  restaurantId: string,
  targetMenuCollectionId?: string | null
): Promise<ResolvedImportTargetMenu | { error: string; status: number }> {
  const all = await listMenuCollectionsForRestaurantPicker(admin, restaurantId, false);
  const active = all.filter((m) => m.is_active);

  const requestedId = targetMenuCollectionId?.trim();
  if (requestedId) {
    const validation = await validateMenuCollectionIdsForRestaurant(
      admin,
      restaurantId,
      [requestedId],
      { activeOnly: true }
    );
    if (!validation.ok) {
      return { error: validation.message, status: 400 };
    }
    const menu = active.find((m) => m.id === requestedId);
    if (!menu) {
      return { error: "Hedef menü geçersiz veya bu restorana ait değil.", status: 400 };
    }
    return { id: menu.id, name: menu.name };
  }

  if (active.length === 1) {
    return { id: active[0].id, name: active[0].name };
  }

  if (active.length >= 2) {
    return { error: "Hedef menü seçimi zorunlu.", status: 400 };
  }

  const fallback = all.find((m) => m.name === "Ana Menü") ?? all[0];
  if (!fallback) {
    return { error: "Menü koleksiyonu bulunamadı.", status: 400 };
  }

  return { id: fallback.id, name: fallback.name };
}
