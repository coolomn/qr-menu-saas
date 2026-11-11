import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { purgePublicMenuCache } from "@/lib/public-menu/cache-purge";
import { evaluateMenuCacheRefreshRateLimit } from "@/lib/rate-limit/menu-cache-refresh";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Admin paneli menüde bir şey kaydettikten sonra çağırır (lib/supabase/browser.ts).
 * Yalnızca oturumdaki kullanıcının sahip olduğu restoranların herkese açık menü önbelleği temizlenir.
 */
export async function POST(request: Request) {
  const { user, error: authErr } = await getUserFromBearer(request);
  if (authErr || !user) {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401, headers: NO_STORE });
  }

  const rate = await evaluateMenuCacheRefreshRateLimit(user.id);
  if (!rate.allowed) return rateLimitedResponse(rate.retryAfterSeconds);

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return NextResponse.json({ error: svc.error }, { status: 503, headers: NO_STORE });
  }

  const { data, error } = await svc.client.from("restaurants").select("id").eq("owner_id", user.id);
  if (error) {
    console.error("[menu-cache] restoranlar okunamadı:", error);
    return NextResponse.json({ error: "Restoran okunamadı." }, { status: 500, headers: NO_STORE });
  }

  const ids = (data ?? []).map((r: { id: string }) => r.id);
  const purge = await purgePublicMenuCache(ids);
  return NextResponse.json({ ok: purge !== "failed", purge, count: ids.length }, { headers: NO_STORE });
}
