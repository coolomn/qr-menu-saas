import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/master-admin/auth";
import { buildOwnerLoginUrl } from "@/lib/master-admin/create-response";
import {
  parseOwnerPasswordResetBody,
  sendOwnerRecoveryEmail,
  setOwnerTemporaryPassword,
} from "@/lib/master-admin/owner-password-reset";
import {
  fetchMasterRestaurantById,
  insertSubscriptionEvent,
  resolveOwnerEmail,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const parsed = parseOwnerPasswordResetBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const existing = await fetchMasterRestaurantById(auth.admin, restaurantId);
    if (!existing.ok) {
      return NextResponse.json({ error: "Restoran bulunamadı." }, { status: 404 });
    }

    const ownerId = existing.restaurant.owner_id;
    if (!ownerId) {
      return NextResponse.json(
        { error: "Bu restorana bağlı owner hesabı yok." },
        { status: 400 }
      );
    }

    const ownerEmail =
      existing.item.owner_email ?? (await resolveOwnerEmail(auth.admin, ownerId));
    if (!ownerEmail) {
      return NextResponse.json(
        { error: "Owner e-postası bulunamadı." },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;

    if (parsed.mode === "email") {
      const sent = await sendOwnerRecoveryEmail(auth.admin, ownerId, ownerEmail, origin);
      if (!sent.ok) {
        return NextResponse.json({ error: sent.error }, { status: 400 });
      }

      await insertSubscriptionEvent(auth.admin, {
        restaurantId,
        eventType: "owner_password_reset_email_sent",
        createdBy: auth.user.id,
        newValues: {
          owner_id: ownerId,
          owner_email: sent.ownerEmail,
          sent_at: sent.sentAt,
        },
      });

      return NextResponse.json({
        ok: true,
        mode: "email",
        owner_email: sent.ownerEmail,
        sent_at: sent.sentAt,
      });
    }

    const updated = await setOwnerTemporaryPassword(auth.admin, ownerId, ownerEmail);
    if (!updated.ok) {
      return NextResponse.json({ error: updated.error }, { status: 400 });
    }

    await insertSubscriptionEvent(auth.admin, {
      restaurantId,
      eventType: "owner_temporary_password_generated",
      createdBy: auth.user.id,
      newValues: {
        owner_id: ownerId,
        owner_email: updated.ownerEmail,
        generated_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "temporary_password",
      owner_email: updated.ownerEmail,
      temporary_password: updated.temporaryPassword,
      login_url: buildOwnerLoginUrl(origin),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Şifre işlemi başarısız." }, { status: 500 });
  }
}
