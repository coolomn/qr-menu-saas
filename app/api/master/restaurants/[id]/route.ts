import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";
import {
  assertSlugAvailable,
  fetchMasterRestaurantById,
  insertSubscriptionEvent,
  syncRestaurantFromSubscription,
  type SubscriptionCoreRow,
} from "@/lib/master-admin/restaurant-data";
import { resolveSubscriptionDates, type PlanType } from "@/lib/master-admin/plans";
import { parseUpdateRestaurantBody } from "@/lib/master-admin/update-payload";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const restaurantId = id.trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "Geçersiz restoran kimliği." }, { status: 400 });
  }

  try {
    const result = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!result.ok) {
      return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ restaurant: result.item });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Restoran okunamadı." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const restaurantId = id.trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "Geçersiz restoran kimliği." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const parsed = parseUpdateRestaurantBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const payload = parsed.data;

  try {
    const existing = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!existing.ok) {
      return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
    }

    if (!existing.subscription) {
      return NextResponse.json({ error: "Abonelik kaydı bulunamadı." }, { status: 500 });
    }

    const oldSnapshot = {
      restaurant: existing.restaurant,
      subscription: existing.subscription,
    };

    if (payload.slug) {
      const available = await assertSlugAvailable(auth.admin, payload.slug, restaurantId);
      if (!available) {
        return NextResponse.json({ error: "Bu slug zaten kullanılıyor." }, { status: 409 });
      }
    }

    const restaurantPatch: Record<string, string> = {};
    if (payload.name) restaurantPatch.name = payload.name;
    if (payload.slug) restaurantPatch.slug = payload.slug;

    if (Object.keys(restaurantPatch).length > 0) {
      const { error: restaurantError } = await auth.admin
        .from("restaurants")
        .update(restaurantPatch)
        .eq("id", restaurantId);

      if (restaurantError) {
        if (restaurantError.code === "23505") {
          return NextResponse.json({ error: "Bu slug zaten kullanılıyor." }, { status: 409 });
        }
        console.error(restaurantError);
        return NextResponse.json({ error: "Restoran güncellenemedi." }, { status: 500 });
      }
    }

    const planType = (payload.plan_type ?? existing.subscription.plan_type) as PlanType;
    const startsInput =
      payload.starts_at !== undefined
        ? payload.starts_at
        : existing.subscription.starts_at;
    const endsInput =
      payload.ends_at !== undefined
        ? payload.ends_at
        : existing.subscription.ends_at;

    let dates: { starts_at: string; ends_at: string | null };
    try {
      if (
        payload.plan_type !== undefined ||
        payload.starts_at !== undefined ||
        payload.ends_at !== undefined
      ) {
        dates = resolveSubscriptionDates(planType, {
          startsAt: startsInput,
          endsAt: planType === "custom" ? endsInput : null,
        });
      } else {
        dates = {
          starts_at: existing.subscription.starts_at,
          ends_at: existing.subscription.ends_at,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Geçersiz tarih.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const subscriptionPatch: Partial<SubscriptionCoreRow> & {
      plan_type: string;
      starts_at: string;
      ends_at: string | null;
    } = {
      plan_type: planType,
      starts_at: dates.starts_at,
      ends_at: dates.ends_at,
    };

    if (payload.max_products !== undefined) subscriptionPatch.max_products = payload.max_products;
    if (payload.max_categories !== undefined) {
      subscriptionPatch.max_categories = payload.max_categories;
    }
    if (payload.max_imports !== undefined) subscriptionPatch.max_imports = payload.max_imports;
    if (payload.import_period !== undefined) {
      subscriptionPatch.import_period = payload.import_period;
    }
    if (payload.admin_notes !== undefined) subscriptionPatch.admin_notes = payload.admin_notes;

    const { error: subscriptionError } = await auth.admin
      .from("restaurant_subscriptions")
      .update(subscriptionPatch)
      .eq("restaurant_id", restaurantId);

    if (subscriptionError) {
      console.error(subscriptionError);
      return NextResponse.json({ error: "Abonelik güncellenemedi." }, { status: 500 });
    }

    await syncRestaurantFromSubscription(auth.admin, restaurantId, {
      ends_at: dates.ends_at,
      status: existing.subscription.status,
    });

    const refreshed = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!refreshed.ok) {
      return NextResponse.json({ error: "Güncelleme sonrası okuma başarısız." }, { status: 500 });
    }

    await insertSubscriptionEvent(auth.admin, {
      restaurantId,
      eventType: "updated",
      createdBy: auth.user.id,
      oldValues: oldSnapshot,
      newValues: {
        restaurant: refreshed.restaurant,
        subscription: refreshed.subscription,
        patch: payload,
      },
    });

    return NextResponse.json({ restaurant: refreshed.item });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Güncelleme başarısız." }, { status: 500 });
  }
}
