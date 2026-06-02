import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserFromBearer } from "@/lib/supabase/route-auth";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import {
  getCategoryForOwner,
  ensureCategoryMenuCollectionLink,
  ensureProductMenuCollectionLink,
} from "@/lib/admin-menu/helpers";
import {
  mergeCreateCategoryTargetsInBatch,
  resolveImportCategoryTargets,
} from "@/lib/menu-import/category-match";
import {
  enforceProductLimit,
  importCommitRequestSchema,
  type ImportProduct,
} from "@/lib/menu-import/schema";
import { resolveImportTargetMenuCollection } from "@/lib/menu-import/target-menu";

export const runtime = "nodejs";

function isSchemaMismatch(msg: string) {
  return /column|schema cache|does not exist|42703/i.test(msg);
}

async function insertCategory(
  admin: SupabaseClient,
  restaurantId: string,
  name: string,
  mainGroup: string,
  sortOrder: number,
  nameEn: string | null = null,
  nameRu: string | null = null
): Promise<{ id: string } | { error: string }> {
  const fullRow = {
    restaurant_id: restaurantId,
    name,
    main_group: mainGroup,
    sort_order: sortOrder,
    name_en: nameEn,
    name_ru: nameRu,
    main_group_en: null as string | null,
    main_group_ru: null as string | null,
  };

  let ins = await admin.from("categories").insert([fullRow]).select("id").single();
  if (ins.error && isSchemaMismatch(ins.error.message)) {
    ins = await admin
      .from("categories")
      .insert([
        {
          restaurant_id: restaurantId,
          name,
          main_group: mainGroup,
          sort_order: sortOrder,
        },
      ])
      .select("id")
      .single();
  }

  if (ins.error || !ins.data?.id) {
    console.error(ins.error);
    return { error: ins.error?.message || "Kategori eklenemedi." };
  }

  return { id: ins.data.id };
}

async function insertProduct(
  admin: SupabaseClient,
  categoryId: string,
  product: ImportProduct
): Promise<{ id: string } | { error: string }> {
  const row = {
    category_id: categoryId,
    name: product.name.trim(),
    description: product.description ?? "",
    price: (product.price ?? "").trim() || "",
    is_active: true,
    allergens: [] as string[],
    image_url: "",
    name_en: product.name_en?.trim() || null,
    name_ru: product.name_ru?.trim() || null,
    description_en: product.description_en ?? "",
    description_ru: product.description_ru ?? "",
  };

  let pr = await admin.from("products").insert([row]).select("id").single();
  if (pr.error && isSchemaMismatch(pr.error.message)) {
    pr = await admin
      .from("products")
      .insert([
        {
          category_id: categoryId,
          name: product.name.trim(),
          description: product.description ?? "",
          price: (product.price ?? "").trim() || "",
          is_active: true,
          allergens: [] as string[],
          image_url: "",
        },
      ])
      .select("id")
      .single();
  }

  if (pr.error || !pr.data?.id) {
    console.error(pr.error);
    return { error: pr.error?.message || "Ürün eklenemedi." };
  }

  return { id: pr.data.id };
}

async function linkCategoryAndProductsToMenu(
  admin: SupabaseClient,
  categoryId: string,
  products: ImportProduct[],
  targetMenuId: string
): Promise<
  | { ok: true; productsCreated: number; productMenuLinksSkipped: boolean }
  | { ok: false; error: string; productsCreated: number }
> {
  try {
    await ensureCategoryMenuCollectionLink(admin, categoryId, targetMenuId);
  } catch (linkErr) {
    console.error(linkErr);
    return { ok: false, error: "Kategori menüye bağlanamadı.", productsCreated: 0 };
  }

  let productsCreated = 0;
  let productMenuLinksSkipped = false;

  for (const p of products) {
    const inserted = await insertProduct(admin, categoryId, p);
    if ("error" in inserted) {
      return { ok: false, error: inserted.error, productsCreated };
    }

    const productLink = await ensureProductMenuCollectionLink(admin, inserted.id, targetMenuId);
    if (!productLink.ok) {
      if ("skipped" in productLink) {
        productMenuLinksSkipped = true;
      } else {
        return {
          ok: false,
          error: productLink.error || "Ürün menüye bağlanamadı.",
          productsCreated,
        };
      }
    }

    productsCreated++;
  }

  return { ok: true, productsCreated, productMenuLinksSkipped };
}

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

    const parsedBody = importCommitRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Veri doğrulanamadı.", details: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { restaurantId, target_menu_collection_id, payload: rawPayload, category_targets } =
      parsedBody.data;

    let payload;
    try {
      payload = enforceProductLimit(rawPayload);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Geçersiz veri";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const resolved = resolveImportCategoryTargets(payload.categories, category_targets);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    const { units, categoriesMergedInBatch } = mergeCreateCategoryTargetsInBatch(
      payload.categories,
      resolved.targets
    );

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

    const targetResult = await resolveImportTargetMenuCollection(
      admin,
      restaurantId,
      target_menu_collection_id
    );
    if ("error" in targetResult) {
      return NextResponse.json({ error: targetResult.error }, { status: targetResult.status });
    }
    const targetMenu = targetResult;

    const { data: maxCat } = await admin
      .from("categories")
      .select("sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSortOrder = typeof maxCat?.sort_order === "number" ? maxCat.sort_order + 1 : 0;

    let categoriesCreated = 0;
    let categoriesReused = 0;
    let productsCreated = 0;
    let productMenuLinksSkipped = false;

    for (const unit of units) {
      const target = unit.target;

      let categoryId: string;

      if (target.mode === "existing") {
        const existingId = target.existing_category_id!;
        const ownerCheck = await getCategoryForOwner(admin, user.id, existingId);
        if ("error" in ownerCheck) {
          return NextResponse.json(
            { error: ownerCheck.error },
            { status: ownerCheck.status === 404 ? 400 : ownerCheck.status }
          );
        }
        categoryId = ownerCheck.category.id;
        categoriesReused++;
      } else {
        const created = await insertCategory(
          admin,
          restaurantId,
          target.name,
          target.main_group,
          nextSortOrder,
          unit.category_name_en,
          unit.category_name_ru
        );
        if ("error" in created) {
          return NextResponse.json(
            {
              error: created.error,
              categoriesCreated,
              categoriesReused,
              productsCreated,
            },
            { status: 500 }
          );
        }
        categoryId = created.id;
        categoriesCreated++;
        nextSortOrder++;
      }

      const linkResult = await linkCategoryAndProductsToMenu(
        admin,
        categoryId,
        unit.products,
        targetMenu.id
      );

      if (!linkResult.ok) {
        return NextResponse.json(
          {
            error: linkResult.error,
            categoriesCreated,
            categoriesReused,
            productsCreated,
          },
          { status: 500 }
        );
      }

      productsCreated += linkResult.productsCreated;
      if (linkResult.productMenuLinksSkipped) {
        productMenuLinksSkipped = true;
      }
    }

    return NextResponse.json({
      ok: true,
      categoriesCreated,
      categoriesReused,
      categoriesMergedInBatch,
      productsCreated,
      target_menu_collection_id: targetMenu.id,
      target_menu_name: targetMenu.name,
      product_menu_links_skipped: productMenuLinksSkipped,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
