import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";
import { parseCreateRestaurantBody } from "@/lib/master-admin/create-payload";
import { resolveOwnerByEmail } from "@/lib/master-admin/owners";
import { createOwnerWithTemporaryPassword } from "@/lib/master-admin/temporary-password";
import { resolveSubscriptionDates } from "@/lib/master-admin/plans";
import { buildInviteSetPasswordUrl } from "@/lib/admin-auth/invite-flow";
import { buildOwnerLoginUrl } from "@/lib/master-admin/create-response";
import type { MasterRestaurantListItem } from "@/lib/master-admin/types";

export const runtime = "nodejs";

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  created_at: string;
  tenant_status: string;
  subscription_ends_at: string | null;
};

type SubscriptionRow = {
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

async function resolveOwnerEmails(
  admin: SupabaseClient,
  ownerIds: (string | null)[]
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  const uniqueIds = [...new Set(ownerIds.filter((id): id is string => Boolean(id)))];

  await Promise.all(
    uniqueIds.map(async (ownerId) => {
      const { data, error } = await admin.auth.admin.getUserById(ownerId);
      if (!error && data.user?.email) {
        emails.set(ownerId, data.user.email);
      }
    })
  );

  return emails;
}

export async function GET(request: Request) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: restaurants, error: restaurantsError } = await auth.admin
    .from("restaurants")
    .select("id, name, slug, owner_id, created_at, tenant_status, subscription_ends_at")
    .order("created_at", { ascending: false });

  if (restaurantsError) {
    console.error(restaurantsError);
    return NextResponse.json({ error: "Restoranlar okunamadı." }, { status: 500 });
  }

  const rows = (restaurants ?? []) as RestaurantRow[];
  const restaurantIds = rows.map((row) => row.id);

  let subscriptionsByRestaurant = new Map<string, SubscriptionRow>();

  if (restaurantIds.length > 0) {
    const { data: subscriptions, error: subscriptionsError } = await auth.admin
      .from("restaurant_subscriptions")
      .select(
        "restaurant_id, plan_type, starts_at, ends_at, status, max_products, max_categories, max_imports, import_period, admin_notes"
      )
      .in("restaurant_id", restaurantIds);

    if (subscriptionsError) {
      console.error(subscriptionsError);
      return NextResponse.json({ error: "Abonelik bilgileri okunamadı." }, { status: 500 });
    }

    subscriptionsByRestaurant = new Map(
      ((subscriptions ?? []) as SubscriptionRow[]).map((sub) => [sub.restaurant_id, sub])
    );
  }

  const ownerEmails = await resolveOwnerEmails(
    auth.admin,
    rows.map((row) => row.owner_id)
  );

  const items: MasterRestaurantListItem[] = rows.map((row) => {
    const sub = subscriptionsByRestaurant.get(row.id);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      owner_id: row.owner_id,
      owner_email: row.owner_id ? ownerEmails.get(row.owner_id) ?? null : null,
      created_at: row.created_at,
      tenant_status: row.tenant_status,
      subscription_ends_at: row.subscription_ends_at,
      plan_type: sub?.plan_type ?? null,
      starts_at: sub?.starts_at ?? null,
      ends_at: sub?.ends_at ?? null,
      status: sub?.status ?? null,
      max_products: sub?.max_products ?? null,
      max_categories: sub?.max_categories ?? null,
      max_imports: sub?.max_imports ?? null,
      import_period: sub?.import_period ?? null,
      admin_notes: sub?.admin_notes ?? null,
    };
  });

  return NextResponse.json({ restaurants: items });
}

export async function POST(request: Request) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const parsed = parseCreateRestaurantBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const payload = parsed.data;

  const { data: slugConflict } = await auth.admin
    .from("restaurants")
    .select("id")
    .eq("slug", payload.slug)
    .maybeSingle();

  if (slugConflict) {
    return NextResponse.json({ error: "Bu slug zaten kullanılıyor." }, { status: 409 });
  }

  let dates: { starts_at: string; ends_at: string | null };
  try {
    dates = resolveSubscriptionDates(payload.plan_type, {
      startsAt: payload.starts_at,
      endsAt: payload.ends_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Geçersiz tarih.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  let ownerUserId: string;
  let ownerInvited = false;
  let ownerExists = false;
  let temporaryPassword: string | undefined;

  if (payload.owner_creation_mode === "temporary_password") {
    const created = await createOwnerWithTemporaryPassword(auth.admin, payload.owner_email);
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: 400 });
    }
    ownerUserId = created.userId;
    temporaryPassword = created.temporaryPassword;
  } else {
    const ownerResult = await resolveOwnerByEmail(
      auth.admin,
      payload.owner_email,
      buildInviteSetPasswordUrl(origin)
    );
    if (!ownerResult.ok) {
      return NextResponse.json({ error: ownerResult.error }, { status: 400 });
    }
    ownerUserId = ownerResult.userId;
    ownerInvited = ownerResult.invited;
    ownerExists = !ownerResult.invited;
  }

  const { data: restaurant, error: restaurantError } = await auth.admin
    .from("restaurants")
    .insert({
      name: payload.name,
      slug: payload.slug,
      owner_id: ownerUserId,
      tenant_status: "active",
      subscription_ends_at: dates.ends_at,
    })
    .select("id, name, slug, owner_id, tenant_status, subscription_ends_at, created_at")
    .single();

  if (restaurantError) {
    if (restaurantError.code === "23505") {
      return NextResponse.json({ error: "Bu slug zaten kullanılıyor." }, { status: 409 });
    }
    console.error(restaurantError);
    return NextResponse.json({ error: "Restoran oluşturulamadı." }, { status: 500 });
  }

  const { error: subscriptionError } = await auth.admin.from("restaurant_subscriptions").insert({
    restaurant_id: restaurant.id,
    plan_type: payload.plan_type,
    starts_at: dates.starts_at,
    ends_at: dates.ends_at,
    status: "active",
    max_products: payload.max_products,
    max_categories: payload.max_categories,
    max_imports: payload.max_imports,
    import_period: payload.import_period ?? "monthly",
    admin_notes: payload.admin_notes,
  });

  if (subscriptionError) {
    console.error(subscriptionError);
    await auth.admin.from("restaurants").delete().eq("id", restaurant.id);
    return NextResponse.json({ error: "Abonelik kaydı oluşturulamadı." }, { status: 500 });
  }

  const { error: eventError } = await auth.admin.from("subscription_events").insert({
    restaurant_id: restaurant.id,
    event_type: "created",
    old_values: null,
    new_values: {
      name: payload.name,
      slug: payload.slug,
      owner_email: payload.owner_email,
      owner_id: ownerUserId,
      plan_type: payload.plan_type,
      starts_at: dates.starts_at,
      ends_at: dates.ends_at,
      status: "active",
      max_products: payload.max_products,
      max_categories: payload.max_categories,
      max_imports: payload.max_imports,
      import_period: payload.import_period ?? "monthly",
      admin_notes: payload.admin_notes,
      owner_invited: ownerInvited,
      owner_creation_mode: payload.owner_creation_mode,
    },
    created_by: auth.user.id,
  });

  if (eventError) {
    console.error("subscription_events insert failed:", eventError);
  }

  const loginUrl = buildOwnerLoginUrl(origin);
  const inviteSentAt =
    payload.owner_creation_mode === "invite" && ownerInvited ? new Date().toISOString() : null;

  const responseBody: Record<string, unknown> = {
    restaurant,
    owner_email: payload.owner_email,
    owner_creation_mode: payload.owner_creation_mode,
    owner_invited: ownerInvited,
    owner_exists: ownerExists,
    login_url: loginUrl,
    invite_sent_at: inviteSentAt,
  };

  if (temporaryPassword) {
    responseBody.temporary_password = temporaryPassword;
  }

  return NextResponse.json(responseBody, { status: 201 });
}
