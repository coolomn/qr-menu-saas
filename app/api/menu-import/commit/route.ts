import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  enforceProductLimit,
  importMenuPayloadSchema,
} from "@/lib/menu-import/schema";

export const runtime = "nodejs";

type Body = {
  restaurantId?: string;
  payload?: unknown;
};

function isSchemaMismatch(msg: string) {
  return /column|schema cache|does not exist|42703/i.test(msg);
}

export async function POST(request: Request) {
  try {
    const { user, error: authErr } = await getUserFromBearer(request);
    if (authErr || !user) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    }

    const restaurantId = body.restaurantId?.trim();
    if (!restaurantId) {
      return NextResponse.json({ error: "restaurantId zorunlu." }, { status: 400 });
    }

    const parsed = importMenuPayloadSchema.safeParse(body.payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Veri doğrulanamadı.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    let payload;
    try {
      payload = enforceProductLimit(parsed.data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Geçersiz veri";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const svc = tryCreateServiceSupabase();
    if (!svc.ok) {
      return NextResponse.json({ error: svc.error }, { status: 503 });
    }
    const admin = svc.client;

    const { data: restaurant, error: resErr } = await admin
      .from("restaurants")
      .select("id")
      .eq("id", restaurantId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (resErr || !restaurant) {
      return NextResponse.json({ error: "Restoran bulunamadı veya yetkiniz yok." }, { status: 403 });
    }

    const { data: maxCat } = await admin
      .from("categories")
      .select("sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    let sortBase = typeof maxCat?.sort_order === "number" ? maxCat.sort_order + 1 : 0;

    let categoriesCreated = 0;
    let productsCreated = 0;

    for (let i = 0; i < payload.categories.length; i++) {
      const cat = payload.categories[i];
      const mainGroup = (cat.main_group && cat.main_group.trim()) || "DİĞER";

      const fullRow = {
        restaurant_id: restaurantId,
        name: cat.name.trim(),
        main_group: mainGroup,
        sort_order: sortBase + i,
        name_en: null as string | null,
        name_ru: null as string | null,
        main_group_en: null as string | null,
        main_group_ru: null as string | null,
      };

      let catId: string | null = null;
      let ins = await admin.from("categories").insert([fullRow]).select("id").single();
      if (ins.error && isSchemaMismatch(ins.error.message)) {
        ins = await admin
          .from("categories")
          .insert([
            {
              restaurant_id: restaurantId,
              name: cat.name.trim(),
              main_group: mainGroup,
              sort_order: sortBase + i,
            },
          ])
          .select("id")
          .single();
      }
      if (ins.error || !ins.data?.id) {
        console.error(ins.error);
        return NextResponse.json(
          { error: ins.error?.message || "Kategori eklenemedi.", categoriesCreated, productsCreated },
          { status: 500 }
        );
      }
      catId = ins.data.id;
      categoriesCreated++;

      for (const p of cat.products) {
        const row = {
          category_id: catId,
          name: p.name.trim(),
          description: p.description ?? "",
          price: (p.price ?? "").trim() || "",
          is_active: true,
          allergens: [] as string[],
          image_url: "",
          name_en: null as string | null,
          name_ru: null as string | null,
          description_en: null as string | null,
          description_ru: null as string | null,
        };

        let pr = await admin.from("products").insert([row]).select("id").single();
        if (pr.error && isSchemaMismatch(pr.error.message)) {
          pr = await admin
            .from("products")
            .insert([
              {
                category_id: catId,
                name: p.name.trim(),
                description: p.description ?? "",
                price: (p.price ?? "").trim() || "",
                is_active: true,
                allergens: [] as string[],
                image_url: "",
              },
            ])
            .select("id")
            .single();
        }
        if (pr.error) {
          console.error(pr.error);
          return NextResponse.json(
            {
              error: pr.error.message || "Ürün eklenemedi.",
              categoriesCreated,
              productsCreated,
            },
            { status: 500 }
          );
        }
        productsCreated++;
      }
    }

    return NextResponse.json({ ok: true, categoriesCreated, productsCreated });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
