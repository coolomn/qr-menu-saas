import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicMenuBlocked } from "@/lib/public-menu/subscription-gate";

export const TENANT_INACTIVE_MESSAGE =
  "Aboneliğiniz aktif değil. Bu özelliği kullanmak için aboneliğinizi yenileyin.";
export const RESTAURANT_FORBIDDEN_MESSAGE = "Restoran bulunamadı veya yetkiniz yok.";

type TenantGateRow = {
  id: string;
  tenant_status?: string | null;
  subscription_ends_at?: string | null;
};

export type ActiveTenantResult =
  | { ok: true; restaurantId: string }
  | { ok: false; status: 403 | 500; error: string; reason: "forbidden" | "inactive" | "db_error" };

/**
 * Restoran askıya alınmış / süresi dolmuşsa true.
 * Public menü kapısıyla aynı kural (restaurants.tenant_status + subscription_ends_at;
 * master admin bu kolonları restaurant_subscriptions'tan senkronlar).
 */
export function isTenantInactive(row: TenantGateRow): boolean {
  return isPublicMenuBlocked(row);
}

/**
 * Maliyetli (OpenAI) veya menüye yazan sahip uç noktaları için:
 * - restaurantId verilirse: o restoran bu kullanıcıya ait ve aktif olmalı.
 * - verilmezse: kullanıcının en az bir aktif restoranı olmalı (eski istemci uyumluluğu).
 */
export async function requireActiveOwnedRestaurant(
  admin: SupabaseClient,
  params: { userId: string; restaurantId?: string | null }
): Promise<ActiveTenantResult> {
  const restaurantId = params.restaurantId?.trim() || null;

  let query = admin
    .from("restaurants")
    .select("id, tenant_status, subscription_ends_at")
    .eq("owner_id", params.userId);
  if (restaurantId) {
    query = query.eq("id", restaurantId);
  }

  const { data, error } = await query.limit(restaurantId ? 1 : 50);
  if (error) {
    console.error("[active-tenant] restaurant lookup failed:", error);
    return { ok: false, status: 500, error: "Restoran bilgisi okunamadı.", reason: "db_error" };
  }

  const rows = (data ?? []) as TenantGateRow[];
  if (rows.length === 0) {
    return { ok: false, status: 403, error: RESTAURANT_FORBIDDEN_MESSAGE, reason: "forbidden" };
  }

  const active = rows.find((row) => !isTenantInactive(row));
  if (!active) {
    return { ok: false, status: 403, error: TENANT_INACTIVE_MESSAGE, reason: "inactive" };
  }

  return { ok: true, restaurantId: active.id };
}
