import { NextResponse } from "next/server";
import { inferAllergensWithOpenAI } from "@/lib/allergens/openai-allergen-infer";
import { runAllergenSuggestionPipeline } from "@/lib/suggest-allergens";
import { getUserFromBearer } from "@/lib/supabase/route-auth";

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

    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const text = (key: string) => (typeof rec[key] === "string" ? rec[key] : "");

    const suggestions = await runAllergenSuggestionPipeline(
      {
        name: text("name"),
        description: text("description"),
        categoryName: text("categoryName"),
        name_en: text("name_en"),
        description_en: text("description_en"),
        name_ru: text("name_ru"),
        description_ru: text("description_ru"),
        menuCollectionName: text("menuCollectionName"),
      },
      inferAllergensWithOpenAI
    );

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Alerjen önerisi alınamadı." }, { status: 500 });
  }
}
