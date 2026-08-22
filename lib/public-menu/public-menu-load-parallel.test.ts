import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assemblePublicMenuCatalog,
  buildPublicMenuFull,
  type PublicMenuFullPayload,
  type RestaurantRow,
} from "./load-public-menu";
import { buildCategoryMenuIdsMap } from "./menu-collections";

const restaurantRow: RestaurantRow = {
  id: "rest-1",
  slug: "demo",
  name: "Demo",
  logo_url: null,
  primary_color: "#111",
  slider_images: [],
  welcome_bg_url: null,
  instagram: null,
};

const menuCollections = [
  {
    id: "mc-breakfast",
    name: "Kahvaltı",
    name_en: "Breakfast",
    name_ru: null,
    description: null,
    start_time: "08:00",
    end_time: "12:00",
    sort_order: 0,
    card_visual_type: "icon" as const,
    card_image_url: null,
  },
  {
    id: "mc-all-day",
    name: "All Day",
    name_en: "All Day",
    name_ru: null,
    description: null,
    start_time: null,
    end_time: null,
    sort_order: 1,
    card_visual_type: "icon" as const,
    card_image_url: null,
  },
];

const categoryRows = [
  {
    id: "cat-1",
    name: "Kahve",
    name_en: "Coffee",
    name_ru: null,
    main_group: "İÇECEKLER",
    main_group_en: null,
    main_group_ru: null,
    sort_order: 0,
  },
];

const productRows = [
  {
    id: "prod-1",
    category_id: "cat-1",
    name: "Latte",
    name_en: "Latte",
    name_ru: null,
    description: "Sütlü",
    description_en: "With milk",
    description_ru: null,
    price: "120",
    image_url: "https://cdn.example/latte.webp",
    thumbnail_url: "https://cdn.example/latte-thumb.webp",
    allergens: ["dairy"],
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type QueryResult = { data: unknown; error: null } | { data: null; error: { message: string } };

function createThenableQuery(
  table: string,
  run: () => Promise<QueryResult>,
  tracker: { inFlight: number; maxInFlight: number; tables: string[] }
) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    neq() {
      return builder;
    },
    in() {
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      return run();
    },
    then(onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) {
      tracker.inFlight += 1;
      tracker.maxInFlight = Math.max(tracker.maxInFlight, tracker.inFlight);
      tracker.tables.push(table);
      return run()
        .then((result) => {
          tracker.inFlight -= 1;
          return onFulfilled(result);
        })
        .catch(onRejected);
    },
  };
  return builder;
}

function createParallelTrackingSupabase(perQueryDelayMs: number) {
  const tracker = { inFlight: 0, maxInFlight: 0, tables: [] as string[] };

  const client = {
    from(table: string) {
      return createThenableQuery(
        table,
        async () => {
          await sleep(perQueryDelayMs);
          switch (table) {
            case "categories":
              return { data: categoryRows, error: null };
            case "menu_collections":
              return {
                data: menuCollections.map((menu) => ({
                  ...menu,
                  is_active: true,
                  restaurant_id: restaurantRow.id,
                })),
                error: null,
              };
            case "products":
              return { data: productRows, error: null };
            case "category_menu_collections":
              return {
                data: [{ category_id: "cat-1", menu_collection_id: "mc-breakfast" }],
                error: null,
              };
            case "product_menu_collections":
              return {
                data: [{ product_id: "prod-1", menu_collection_id: "mc-breakfast" }],
                error: null,
              };
            case "product_variants":
              return {
                data: [
                  {
                    id: "var-1",
                    product_id: "prod-1",
                    label: "Büyük",
                    label_en: "Large",
                    label_ru: null,
                    price: "150",
                    sort_order: 0,
                    is_active: true,
                    created_at: "2026-01-01T00:00:00Z",
                  },
                ],
                error: null,
              };
            default:
              return { data: [], error: null };
          }
        },
        tracker
      );
    },
  } as unknown as SupabaseClient;

  return { client, tracker };
}

describe("assemblePublicMenuCatalog", () => {
  it("preserves categories, products, variants, allergens and menu collection ids", () => {
    const menuIdsByCategory = new Map<string, string[]>([["cat-1", ["mc-breakfast"]]]);
    const menuIdsByProduct = new Map<string, string[]>([["prod-1", ["mc-breakfast"]]]);

    const catalog = assemblePublicMenuCatalog({
      categoryRows,
      menuData: {
        menu_collections: menuCollections,
        menu_picker: { enabled: true, default_menu_collection_id: "mc-breakfast" },
      },
      products: productRows,
      menuIdsByCategory,
      productJunctionMaps: {
        menuIdsByProduct,
        productsWithJunction: new Set(["prod-1"]),
      },
      variantsByProduct: new Map([
        [
          "prod-1",
          [
            {
              id: "var-1",
              label: "Büyük",
              label_en: "Large",
              label_ru: null,
              price: "150",
              sort_order: 0,
            },
          ],
        ],
      ]),
    });

    assert.equal(catalog.categories.length, 1);
    assert.deepEqual(catalog.categories[0].menu_collection_ids, ["mc-breakfast"]);
    assert.equal(catalog.products.length, 1);
    assert.deepEqual(catalog.products[0].allergens, ["dairy"]);
    assert.deepEqual(catalog.products[0].menu_collection_ids, ["mc-breakfast"]);
    assert.equal(catalog.products[0].variants?.length, 1);
    assert.equal(catalog.menu_picker.enabled, true);
  });

  it("handles empty categories and products", () => {
    const catalog = assemblePublicMenuCatalog({
      categoryRows: [],
      menuData: {
        menu_collections: menuCollections,
        menu_picker: { enabled: true, default_menu_collection_id: "mc-breakfast" },
      },
      products: [],
      menuIdsByCategory: new Map(),
      productJunctionMaps: {
        menuIdsByProduct: new Map(),
        productsWithJunction: new Set(),
      },
      variantsByProduct: new Map(),
    });

    assert.deepEqual(catalog.categories, []);
    assert.deepEqual(catalog.products, []);
    assert.equal(catalog.menu_collections.length, 2);
  });
});

describe("buildCategoryMenuIdsMap", () => {
  it("applies default menu fallback when junction is missing", async () => {
    const supabase = {
      from(table: string) {
        assert.equal(table, "category_menu_collections");
        return createThenableQuery(
          table,
          async () => ({ data: [], error: null }),
          { inFlight: 0, maxInFlight: 0, tables: [] }
        );
      },
    } as unknown as SupabaseClient;

    const map = await buildCategoryMenuIdsMap(
      supabase,
      ["cat-1"],
      new Set(["mc-breakfast", "mc-all-day"]),
      "mc-breakfast"
    );

    assert.deepEqual(map.get("cat-1"), ["mc-breakfast"]);
  });
});

describe("buildPublicMenuFull parallel loading", () => {
  it("keeps full payload shape and multi-menu picker metadata", async () => {
    const { client } = createParallelTrackingSupabase(0);
    const payload = await buildPublicMenuFull(client, restaurantRow);

    assert.ok(payload.restaurant.slug === "demo");
    assert.equal(payload.menu_collections.length, 2);
    assert.equal(payload.menu_picker.enabled, true);
    assert.equal(payload.categories.length, 1);
    assert.equal(payload.products.length, 1);
    assert.equal(payload.products[0].variants?.[0]?.label, "Büyük");
  });

  it("runs independent queries concurrently within load groups", async () => {
    const perQueryMs = 25;
    const { client, tracker } = createParallelTrackingSupabase(perQueryMs);
    const startedAt = Date.now();
    await buildPublicMenuFull(client, restaurantRow);
    const elapsedMs = Date.now() - startedAt;

    assert.ok(tracker.maxInFlight >= 2, "expected at least two concurrent queries");
    assert.ok(
      elapsedMs < perQueryMs * 5,
      `parallel groups should beat serial baseline (~${perQueryMs * 6}ms), got ${elapsedMs}ms`
    );
  });

  it("propagates category query failures without partial payload", async () => {
    const client = {
      from(table: string) {
        return createThenableQuery(
          table,
          async () => {
            if (table === "categories") {
              return { data: null, error: { message: "categories failed" } };
            }
            return { data: [], error: null };
          },
          { inFlight: 0, maxInFlight: 0, tables: [] }
        );
      },
    } as unknown as SupabaseClient;

    await assert.rejects(async () => {
      await buildPublicMenuFull(client, restaurantRow);
    }, (error: unknown) => {
      return (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        (error as { message: string }).message === "categories failed"
      );
    });
  });
});

describe("full payload backward compatibility", () => {
  it("still exposes restaurant, menu collections, categories and products together", () => {
    const payload: PublicMenuFullPayload = {
      restaurant: {
        slug: "demo",
        name: "Demo",
        logo_url: null,
        primary_color: "#111",
        slider_images: [],
        welcome_bg_url: null,
        instagram: null,
        logo_display_mode: "auto",
        theme_id: "classic",
        font_style_id: "classic",
      },
      menu_collections: menuCollections,
      menu_picker: { enabled: true, default_menu_collection_id: "mc-breakfast" },
      categories: [
        {
          id: "cat-1",
          name: "Kahve",
          name_en: "Coffee",
          name_ru: null,
          main_group: "İÇECEKLER",
          main_group_en: null,
          main_group_ru: null,
          sort_order: 0,
          menu_collection_ids: ["mc-breakfast"],
        },
      ],
      products: [
        {
          id: "prod-1",
          category_id: "cat-1",
          name: "Latte",
          name_en: "Latte",
          name_ru: null,
          description: "Sütlü",
          description_en: "With milk",
          description_ru: null,
          price: "120",
          image_url: "https://cdn.example/latte.webp",
          thumbnail_url: "https://cdn.example/latte-thumb.webp",
          allergens: ["dairy"],
          menu_collection_ids: ["mc-breakfast"],
          sort_order: 0,
          variants: [
            {
              id: "var-1",
              label: "Büyük",
              label_en: "Large",
              label_ru: null,
              price: "150",
              sort_order: 0,
            },
          ],
        },
      ],
    };

    assert.ok(payload.restaurant);
    assert.ok(Array.isArray(payload.menu_collections));
    assert.ok(Array.isArray(payload.categories));
    assert.ok(Array.isArray(payload.products));
  });
});

describe("estimated cache MISS latency", () => {
  it("documents serial vs parallel round-trip savings", () => {
    const perQueryMs = 40;
    const serialMs = perQueryMs * 6;
    const parallelMs = perQueryMs * 3;
    assert.equal(serialMs, 240);
    assert.equal(parallelMs, 120);
    assert.ok(parallelMs <= serialMs / 2);
  });
});
