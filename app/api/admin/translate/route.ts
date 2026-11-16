import { NextResponse } from "next/server";
import { aiTranslateRequestSchema, compactAiTranslateItems } from "@/lib/i18n/ai-translate-request";
import { translateMenuItemsWithOpenAI } from "@/lib/i18n/ai-translate-openai";
import { evaluateAiTranslateRateLimit } from "@/lib/rate-limit/ai-translate";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { requireActiveOwnedRestaurant } from "@/lib/tenant/active-tenant";

export const runtime = "nodejs";

const UNAVAILABLE = "AI çeviri şu anda kullanılamıyor. Çevirileri elle yazabilir ya da birazdan tekrar deneyebilirsiniz.";

/**
 * Faz 2.5b: Türkçe menü metinlerini tek bir hedef dile çevirir. Veritabanına YAZMAZ;
 * sonucu panel gösterir, işletme kaydeder (elle yazılmış çeviriler istemcide korunur).
 */
export async function POST(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const parsed = aiTranslateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }
    const { restaurantId, targetLanguage } = parsed.data;
    const items = compactAiTranslateItems(parsed.data.items);
    if (items.length === 0) {
      return NextResponse.json({ results: {} });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    const tenant = await requireActiveOwnedRestaurant(svc.client, { userId: user.id, restaurantId });
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    // Kota, sahiplik/abonelik kontrolünden sonra: askıdaki veya hatalı istekler kota yakmasın.
    const rateLimit = await evaluateAiTranslateRateLimit(user.id);
    if (!rateLimit.allowed) {
      if (rateLimit.kind === "limited") {
        return rateLimitedResponse(rateLimit.retryAfterSeconds);
      }
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    const outcome = await translateMenuItemsWithOpenAI(targetLanguage, items);
    if (!outcome.ok) {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    return NextResponse.json({ results: outcome.results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Çeviri alınamadı." }, { status: 500 });
  }
}
