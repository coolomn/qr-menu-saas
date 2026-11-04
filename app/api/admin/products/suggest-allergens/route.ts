import { NextResponse } from "next/server";
import { inferAllergensWithOpenAI } from "@/lib/allergens/openai-allergen-infer";
import { runAllergenSuggestionPipeline } from "@/lib/suggest-allergens";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { evaluateAllergenSuggestRateLimit } from "@/lib/rate-limit/allergen-suggest";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { requireActiveOwnedRestaurant } from "@/lib/tenant/active-tenant";
import { suggestAllergensBodySchema } from "@/lib/allergens/suggest-request";

export const runtime = "nodejs";

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

    const parsed = suggestAllergensBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }
    const { restaurantId, ...input } = parsed.data;

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: "Alerjen önerisi şu anda kullanılamıyor." }, { status: 503 });
    }
    const tenant = await requireActiveOwnedRestaurant(svc.client, { userId: user.id, restaurantId });
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    // Kota, sahiplik/abonelik kontrolünden sonra: askıdaki veya hatalı istekler kota yakmasın.
    const rateLimit = await evaluateAllergenSuggestRateLimit(user.id);
    if (!rateLimit.allowed) {
      if (rateLimit.kind === "limited") {
        return rateLimitedResponse(rateLimit.retryAfterSeconds);
      }
      return NextResponse.json(
        { error: "Alerjen önerisi şu anda kullanılamıyor. Lütfen birazdan tekrar deneyin." },
        { status: 503 }
      );
    }

    const suggestions = await runAllergenSuggestionPipeline(
      input,
      inferAllergensWithOpenAI
    );

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Alerjen önerisi alınamadı." }, { status: 500 });
  }
}
