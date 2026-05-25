import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";
import {
  fetchMasterRestaurantById,
  insertSubscriptionEvent,
  syncRestaurantFromSubscription,
} from "@/lib/master-admin/restaurant-data";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

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

  try {
    const existing = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!existing.ok) {
      return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
    }
    if (!existing.subscription) {
      return NextResponse.json({ error: "Abonelik kaydı bulunamadı." }, { status: 500 });
    }

    const currentStatus =
      existing.subscription.status === "suspended" ||
      existing.restaurant.tenant_status === "suspended"
        ? "suspended"
        : "active";

    const newStatus = currentStatus === "suspended" ? "active" : "suspended";

    const { error: subError } = await auth.admin
      .from("restaurant_subscriptions")
      .update({ status: newStatus })
      .eq("restaurant_id", restaurantId);

    if (subError) {
      console.error(subError);
      return NextResponse.json({ error: "Durum güncellenemedi." }, { status: 500 });
    }

    await syncRestaurantFromSubscription(auth.admin, restaurantId, {
      ends_at: existing.subscription.ends_at,
      status: newStatus,
    });

    const refreshed = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!refreshed.ok) {
      return NextResponse.json({ error: "Güncelleme sonrası okuma başarısız." }, { status: 500 });
    }

    await insertSubscriptionEvent(auth.admin, {
      restaurantId,
      eventType: "status_changed",
      createdBy: auth.user.id,
      oldValues: { status: currentStatus },
      newValues: { status: newStatus },
    });

    return NextResponse.json({ restaurant: refreshed.item, status: newStatus });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Durum güncellenemedi." }, { status: 500 });
  }
}
