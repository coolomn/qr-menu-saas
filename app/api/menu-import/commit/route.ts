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
  type MergedCommitProduct,
} from "@/lib/menu-import/category-match";
import {
  buildProductCatalogIndex,
  catalogProductFromInsert,
  normalizeProductName,
  planImportProductCommit,
  type ExistingCatalogProduct,
  type ProductMergeAction,
} from "@/lib/menu-import/product-match";
import {
  enforceProductLimit,
  importCommitRequestSchema,
  type ImportProduct,
  type ImportProductResolution,
} from "@/lib/menu-import/schema";
import { resolveImportTargetMenuCollection } from "@/lib/menu-import/target-menu";
import {
  normalizeImportVariantsForCommit,
  resolveImportProductPrice,
  type ImportVariantCommitRow,
} from "@/lib/menu-import/variant-templates";

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
  const price = resolveImportProductPrice(product);
  const row = {
    category_id: categoryId,
    name: product.name.trim(),
    description: product.description ?? "",
    price,
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
          price,
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

async function updateProductMergeFields(
  admin: SupabaseClient,
  productId: string,
  fields: { price?: string; description?: string }
): Promise<{ ok: true } | { error: string }> {
  const patch: Record<string, string> = {};
  if (fields.price != null) patch.price = fields.price;
  if (fields.description != null) patch.description = fields.description;
  if (Object.keys(patch).length === 0) return { ok: true };

  const { error } = await admin.from("products").update(patch).eq("id", productId);
  if (error) {
    console.error("[menu-import] product merge update failed:", error);
    return { error: error.message || "Mevcut ürün güncellenemedi." };
  }
  return { ok: true };
}

function resolutionActionMap(
  resolutions: ImportProductResolution[] | undefined
): Map<string, ProductMergeAction> {
  const map = new Map<string, ProductMergeAction>();
  for (const row of resolutions ?? []) {
    map.set(`${row.import_index}:${row.product_index}`, row.action);
  }
  return map;
}

async function loadRestaurantProductCatalog(
  admin: SupabaseClient,
  restaurantId: string
): Promise<ExistingCatalogProduct[]> {
  const { data: productRows, error: productErr } = await admin
    .from("products")
    .select("id, name, description, price, category_id")
    .eq("restaurant_id", restaurantId);

  if (productErr) {
    console.error("[menu-import] catalog load failed:", productErr);
    throw new Error("Mevcut ürünler okunamadı.");
  }

  const products = (productRows ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    price: string | null;
    category_id: string;
  }>;

  const variantLabels = new Map<string, string[]>();
  const productIds = products.map((p) => p.id);
  if (productIds.length > 0) {
    const { data: variantRows, error: variantErr } = await admin
      .from("product_variants")
      .select("product_id, label, is_active")
      .in("product_id", productIds)
      .eq("is_active", true);

    if (variantErr) {
      if (!isSchemaMismatch(variantErr.message)) {
        console.error("[menu-import] catalog variants load failed:", variantErr);
      }
    } else {
      for (const row of variantRows ?? []) {
        const pid = row.product_id as string;
        const label = typeof row.label === "string" ? row.label : "";
        if (!pid || !label.trim()) continue;
        const list = variantLabels.get(pid) ?? [];
        list.push(label);
        variantLabels.set(pid, list);
      }
    }
  }

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    category_id: p.category_id,
    variant_labels: variantLabels.get(p.id) ?? [],
  }));
}

async function deleteProduct(admin: SupabaseClient, productId: string): Promise<void> {
  const { error } = await admin.from("products").delete().eq("id", productId);
  if (error) {
    console.error("[menu-import] product rollback failed:", error);
  }
}

async function insertProductVariants(
  admin: SupabaseClient,
  productId: string,
  restaurantId: string,
  variantRows: ImportVariantCommitRow[]
): Promise<
  | { ok: true; count: number }
  | { ok: false; error: string; schemaMismatch: boolean }
> {
  if (variantRows.length === 0) {
    return { ok: true, count: 0 };
  }

  const insertRows = variantRows.map((variant, index) => ({
    product_id: productId,
    restaurant_id: restaurantId,
    label: variant.label,
    label_en: variant.label_en,
    label_ru: variant.label_ru,
    price: variant.price,
    sort_order: index,
    is_active: true,
  }));

  const { data, error } = await admin.from("product_variants").insert(insertRows).select("id");

  if (error) {
    console.error("[menu-import] variant insert failed:", error);
    return {
      ok: false,
      error: error.message || "Varyantlar kaydedilemedi.",
      schemaMismatch: isSchemaMismatch(error.message),
    };
  }

  return { ok: true, count: data?.length ?? variantRows.length };
}

async function linkCategoryAndProductsToMenu(
  admin: SupabaseClient,
  restaurantId: string,
  categoryId: string,
  products: MergedCommitProduct[],
  targetMenuId: string,
  catalogIndex: Map<string, ExistingCatalogProduct>,
  resolutions: Map<string, ProductMergeAction>
): Promise<
  | {
      ok: true;
      productsCreated: number;
      productsMerged: number;
      productsUpdated: number;
      productMenuLinksSkipped: boolean;
      variantsCreated: number;
      variantProductsCreated: number;
      variantsSkipped: boolean;
    }
  | { ok: false; error: string; productsCreated: number; productsMerged: number }
> {
  try {
    await ensureCategoryMenuCollectionLink(admin, categoryId, targetMenuId);
  } catch (linkErr) {
    console.error(linkErr);
    return { ok: false, error: "Kategori menüye bağlanamadı.", productsCreated: 0, productsMerged: 0 };
  }

  let productsCreated = 0;
  let productsMerged = 0;
  let productsUpdated = 0;
  let productMenuLinksSkipped = false;
  let variantsCreated = 0;
  let variantProductsCreated = 0;
  let variantsSkipped = false;

  for (const item of products) {
    const p = item.product;
    const userAction =
      resolutions.get(`${item.source_import_index}:${item.source_product_index}`) ?? null;
    const plan = planImportProductCommit(p, catalogIndex, userAction);

    if (plan.mode === "reuse") {
      const patch: { price?: string; description?: string } = {};
      if (plan.updatePrice != null) patch.price = plan.updatePrice;
      if (plan.fillDescription != null) patch.description = plan.fillDescription;
      if (patch.price != null || patch.description != null) {
        const updated = await updateProductMergeFields(admin, plan.existing.id, patch);
        if ("error" in updated) {
          return { ok: false, error: updated.error, productsCreated, productsMerged };
        }
        if (patch.price != null) productsUpdated++;
      }

      if (plan.existing.category_id !== categoryId) {
        try {
          await ensureCategoryMenuCollectionLink(admin, plan.existing.category_id, targetMenuId);
        } catch (linkErr) {
          console.error(linkErr);
          return {
            ok: false,
            error: "Mevcut ürün kategorisi menüye bağlanamadı.",
            productsCreated,
            productsMerged,
          };
        }
      }

      const productLink = await ensureProductMenuCollectionLink(
        admin,
        plan.existing.id,
        targetMenuId
      );
      if (!productLink.ok) {
        if ("skipped" in productLink) {
          productMenuLinksSkipped = true;
        } else {
          return {
            ok: false,
            error: productLink.error || "Ürün menüye bağlanamadı.",
            productsCreated,
            productsMerged,
          };
        }
      }

      productsMerged++;
      continue;
    }

    const variantRows = normalizeImportVariantsForCommit(p.variants);
    const inserted = await insertProduct(admin, categoryId, p);
    if ("error" in inserted) {
      return { ok: false, error: inserted.error, productsCreated, productsMerged };
    }

    if (variantRows.length > 0) {
      const variantResult = await insertProductVariants(
        admin,
        inserted.id,
        restaurantId,
        variantRows
      );
      if (!variantResult.ok) {
        if (variantResult.schemaMismatch) {
          variantsSkipped = true;
        } else {
          await deleteProduct(admin, inserted.id);
          return {
            ok: false,
            error: variantResult.error,
            productsCreated,
            productsMerged,
          };
        }
      } else {
        variantsCreated += variantResult.count;
        variantProductsCreated++;
      }
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
          productsMerged,
        };
      }
    }

    const key = normalizeProductName(p.name);
    if (key && !catalogIndex.has(key)) {
      catalogIndex.set(key, catalogProductFromInsert(inserted.id, categoryId, p));
    }
    productsCreated++;
  }

  return {
    ok: true,
    productsCreated,
    productsMerged,
    productsUpdated,
    productMenuLinksSkipped,
    variantsCreated,
    variantProductsCreated,
    variantsSkipped,
  };
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

    const {
      restaurantId,
      target_menu_collection_id,
      payload: rawPayload,
      category_targets,
      product_resolutions,
    } = parsedBody.data;

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

    const catalogIndex = buildProductCatalogIndex(
      await loadRestaurantProductCatalog(admin, restaurantId)
    );
    const resolutions = resolutionActionMap(product_resolutions);

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
    let productsMerged = 0;
    let productsUpdated = 0;
    let productMenuLinksSkipped = false;
    let variantsCreated = 0;
    let variantProductsCreated = 0;
    let variantsSkipped = false;

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
          unit.category_name_en ?? null,
          unit.category_name_ru ?? null
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
        restaurantId,
        categoryId,
        unit.products,
        targetMenu.id,
        catalogIndex,
        resolutions
      );

      if (!linkResult.ok) {
        return NextResponse.json(
          {
            error: linkResult.error,
            categoriesCreated,
            categoriesReused,
            productsCreated,
            productsMerged,
          },
          { status: 500 }
        );
      }

      productsCreated += linkResult.productsCreated;
      productsMerged += linkResult.productsMerged;
      productsUpdated += linkResult.productsUpdated;
      variantsCreated += linkResult.variantsCreated;
      variantProductsCreated += linkResult.variantProductsCreated;
      if (linkResult.productMenuLinksSkipped) {
        productMenuLinksSkipped = true;
      }
      if (linkResult.variantsSkipped) {
        variantsSkipped = true;
      }
    }

    return NextResponse.json({
      ok: true,
      categoriesCreated,
      categoriesReused,
      categoriesMergedInBatch,
      productsCreated,
      productsMerged,
      productsUpdated,
      variantsCreated,
      variantProductsCreated,
      target_menu_collection_id: targetMenu.id,
      target_menu_name: targetMenu.name,
      product_menu_links_skipped: productMenuLinksSkipped,
      variants_skipped: variantsSkipped,
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Bilinmeyen hata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
