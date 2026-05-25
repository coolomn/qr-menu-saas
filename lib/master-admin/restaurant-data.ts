import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths } from "@/lib/master-admin/plans";
import type { MasterRestaurantListItem } from "@/lib/master-admin/types";

export type RestaurantCoreRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  created_at: string;
  tenant_status: string;
  subscription_ends_at: string | null;
};

export type SubscriptionCoreRow = {
  restaurant_id: string;
  plan_type: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  max_products: number | null;
  max_categories: number | null;
  max_imports: number | null;
  import_period: string;
  admin_notes: string | null;
};

export async function resolveOwnerEmail(
  admin: SupabaseClient,
  ownerId: string | null
): Promise<string | null> {
  if (!ownerId) return null;
  const { data, error } = await admin.auth.admin.getUserById(ownerId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export function toMasterRestaurantItem(
  restaurant: RestaurantCoreRow,
  subscription: SubscriptionCoreRow | null,
  ownerEmail: string | null
): MasterRestaurantListItem {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    owner_id: restaurant.owner_id,
    owner_email: ownerEmail,
    created_at: restaurant.created_at,
    tenant_status: restaurant.tenant_status,
    subscription_ends_at: restaurant.subscription_ends_at,
    plan_type: subscription?.plan_type ?? null,
    starts_at: subscription?.starts_at ?? null,
    ends_at: subscription?.ends_at ?? null,
    status: subscription?.status ?? null,
    max_products: subscription?.max_products ?? null,
    max_categories: subscription?.max_categories ?? null,
    max_imports: subscription?.max_imports ?? null,
    import_period: subscription?.import_period ?? null,
    admin_notes: subscription?.admin_notes ?? null,
  };
}

const RESTAURANT_SELECT =
  "id, name, slug, owner_id, created_at, tenant_status, subscription_ends_at";

const SUBSCRIPTION_SELECT =
  "restaurant_id, plan_type, starts_at, ends_at, status, max_products, max_categories, max_imports, import_period, admin_notes";

export async function fetchMasterRestaurantById(
  admin: SupabaseClient,
  restaurantId: string
): Promise<
  | { ok: true; restaurant: RestaurantCoreRow; subscription: SubscriptionCoreRow | null; item: MasterRestaurantListItem }
  | { ok: false; status: 404 }
> {
  const { data: restaurant, error: restaurantError } = await admin
    .from("restaurants")
    .select(RESTAURANT_SELECT)
    .eq("id", restaurantId)
    .maybeSingle();

  if (restaurantError) {
    console.error(restaurantError);
    throw new Error("Restoran okunamadı.");
  }
  if (!restaurant) {
    return { ok: false, status: 404 };
  }

  const row = restaurant as RestaurantCoreRow;

  const { data: subscription, error: subscriptionError } = await admin
    .from("restaurant_subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (subscriptionError) {
    console.error(subscriptionError);
    throw new Error("Abonelik okunamadı.");
  }

  const subRow = subscription ? (subscription as SubscriptionCoreRow) : null;
  const ownerEmail = await resolveOwnerEmail(admin, row.owner_id);

  return {
    ok: true,
    restaurant: row,
    subscription: subRow,
    item: toMasterRestaurantItem(row, subRow, ownerEmail),
  };
}

export async function assertSlugAvailable(
  admin: SupabaseClient,
  slug: string,
  excludeRestaurantId?: string
): Promise<boolean> {
  let query = admin.from("restaurants").select("id").eq("slug", slug);
  if (excludeRestaurantId) {
    query = query.neq("id", excludeRestaurantId);
  }
  const { data } = await query.maybeSingle();
  return !data;
}

/** Süre uzatma: bitiş geçmişteyse now(), değilse mevcut bitişten devam. */
export function computeExtendedEndsAt(currentEndsAt: string | null, months: 6 | 12): string {
  const now = new Date();
  let base = now;
  if (currentEndsAt) {
    const current = new Date(currentEndsAt);
    if (!Number.isNaN(current.getTime()) && current > now) {
      base = current;
    }
  }
  return addMonths(base, months).toISOString();
}

export async function syncRestaurantFromSubscription(
  admin: SupabaseClient,
  restaurantId: string,
  subscription: Pick<SubscriptionCoreRow, "ends_at" | "status">
): Promise<void> {
  const { error } = await admin
    .from("restaurants")
    .update({
      subscription_ends_at: subscription.ends_at,
      tenant_status: subscription.status,
    })
    .eq("id", restaurantId);

  if (error) {
    console.error("syncRestaurantFromSubscription failed:", error);
    throw new Error("Restoran senkronizasyonu başarısız.");
  }
}

export async function insertSubscriptionEvent(
  admin: SupabaseClient,
  params: {
    restaurantId: string;
    eventType: string;
    createdBy: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  }
): Promise<void> {
  const { error } = await admin.from("subscription_events").insert({
    restaurant_id: params.restaurantId,
    event_type: params.eventType,
    old_values: params.oldValues ?? null,
    new_values: params.newValues ?? null,
    created_by: params.createdBy,
  });
  if (error) {
    console.error("subscription_events insert failed:", error);
  }
}
