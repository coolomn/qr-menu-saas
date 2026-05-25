import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";
import {
  computeExtendedEndsAt,
  fetchMasterRestaurantById,
  insertSubscriptionEvent,
  syncRestaurantFromSubscription,
} from "@/lib/master-admin/restaurant-data";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type ExtendBody = { months?: number };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const restaurantId = id.trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "Geçersiz restoran kimliği." }, { status: 400 });
  }

  let body: ExtendBody;
  try {
    body = (await request.json()) as ExtendBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const months = body.months;
  if (months !== 6 && months !== 12) {
    return NextResponse.json({ error: "months 6 veya 12 olmalı." }, { status: 400 });
  }

  try {
    const existing = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!existing.ok) {
      return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
    }
    if (!existing.subscription) {
      return NextResponse.json({ error: "Abonelik kaydı bulunamadı." }, { status: 500 });
    }

    const oldEndsAt = existing.subscription.ends_at;
    const newEndsAt = computeExtendedEndsAt(oldEndsAt, months);

    const { error: updateError } = await auth.admin
      .from("restaurant_subscriptions")
      .update({ ends_at: newEndsAt })
      .eq("restaurant_id", restaurantId);

    if (updateError) {
      console.error(updateError);
      return NextResponse.json({ error: "Süre uzatılamadı." }, { status: 500 });
    }

    await syncRestaurantFromSubscription(auth.admin, restaurantId, {
      ends_at: newEndsAt,
      status: existing.subscription.status,
    });

    const refreshed = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!refreshed.ok) {
      return NextResponse.json({ error: "Güncelleme sonrası okuma başarısız." }, { status: 500 });
    }

    await insertSubscriptionEvent(auth.admin, {
      restaurantId,
      eventType: "extended",
      createdBy: auth.user.id,
      oldValues: { ends_at: oldEndsAt },
      newValues: { ends_at: newEndsAt, months },
    });

    return NextResponse.json({ restaurant: refreshed.item });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Süre uzatılamadı." }, { status: 500 });
  }
}
