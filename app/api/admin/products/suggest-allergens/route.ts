import { NextResponse } from "next/server";
import { inferAllergensWithOpenAI } from "@/lib/allergens/openai-allergen-infer";
import { runAllergenSuggestionPipeline } from "@/lib/suggest-allergens";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { evaluateAllergenSuggestRateLimit } from "@/lib/rate-limit/allergen-suggest";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { requireActiveOwnedRestaurant } from "@/lib/tenant/active-tenant";
import { z } from "zod";

/** Eski davranış korunur: metin olmayan alanlar (null, sayı…) boş metin sayılır. */
const textField = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().max(max));
const shortText = textField(300);
const longText = textField(3000);

/** Metin uzunlukları sınırlı: büyük gövdeyle OpenAI maliyeti şişirilemesin. */
const suggestAllergensBodySchema = z.object({
  restaurantId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().uuid().optional()
  ),
  name: shortText,
  description: longText,
  categoryName: shortText,
  name_en: shortText,
  description_en: longText,
  name_ru: shortText,
  description_ru: longText,
  menuCollectionName: textField(1000),
});

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const parsed = suggestAllergensBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ürün bilgileri çok uzun veya geçersiz." }, { status: 400 });
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
