import { NextResponse } from "next/server";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  deleteExpiredMenuSnapshots,
  isAuthorizedCronRequest,
  markExpiredSubscriptions,
} from "@/lib/cron/daily-maintenance";

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/** Vercel Cron günde bir kez çağırır (vercel.json). Yalnızca CRON_SECRET taşıyan istekler çalışır. */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401, headers: NO_STORE });
  }

  const service = tryCreateServiceSupabase();
  if (!service.ok) {
    console.error("[cron] service client", service.error);
    return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 500, headers: NO_STORE });
  }
  const admin = service.client;

  const result: {
    expired?: number;
    expireFailed?: number;
    snapshotsDeleted?: number;
    errors: string[];
  } = { errors: [] };

  // Biri başarısız olsa da diğeri çalışsın.
  try {
    const r = await markExpiredSubscriptions(admin);
    result.expired = r.expired.length;
    result.expireFailed = r.failed.length;
  } catch (err) {
    console.error("[cron] markExpiredSubscriptions", err);
    result.errors.push("expire");
  }

  try {
    result.snapshotsDeleted = await deleteExpiredMenuSnapshots(admin);
  } catch (err) {
    console.error("[cron] deleteExpiredMenuSnapshots", err);
    result.errors.push("snapshots");
  }

  console.log("[cron] daily-maintenance", JSON.stringify(result));
  const ok = result.errors.length === 0 && !result.expireFailed;
  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500, headers: NO_STORE });
}
