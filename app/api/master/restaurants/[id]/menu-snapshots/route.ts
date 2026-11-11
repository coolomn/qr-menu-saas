import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";
import { insertSubscriptionEvent } from "@/lib/master-admin/restaurant-data";
import { listMenuSnapshots, restoreMenuSnapshot } from "@/lib/menu-snapshot";
import { evaluateMasterAdminMutationRateLimit } from "@/lib/rate-limit/master-admin";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Restoranın süresi dolmamış menü yedekleri (en yeni önce). */
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

  const result = await listMenuSnapshots(auth.admin, restaurantId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ snapshots: result.snapshots });
}

/** Seçilen yedeği geri yükler. Menü boş değilse 409 döner (üzerine yazmaz). */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireMasterAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rateLimit = await evaluateMasterAdminMutationRateLimit(auth.user.id);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const { id } = await context.params;
  const restaurantId = id.trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "Geçersiz restoran kimliği." }, { status: 400 });
  }

  let snapshotId = "";
  try {
    const body = (await request.json()) as { snapshotId?: unknown };
    snapshotId = typeof body.snapshotId === "string" ? body.snapshotId.trim() : "";
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  if (!snapshotId) {
    return NextResponse.json({ error: "snapshotId gerekli." }, { status: 400 });
  }

  try {
    const result = await restoreMenuSnapshot(auth.admin, snapshotId, restaurantId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await insertSubscriptionEvent(auth.admin, {
      restaurantId,
      eventType: "menu_restored",
      createdBy: auth.user.id,
      newValues: { snapshot_id: snapshotId, counts: result.counts },
    });

    return NextResponse.json({ ok: true, counts: result.counts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Geri yükleme başarısız." }, { status: 500 });
  }
}
