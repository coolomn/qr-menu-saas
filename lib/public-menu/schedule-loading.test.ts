import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPublicMenuFull, type RestaurantRow } from "./load-public-menu";

const restaurant: RestaurantRow = {
  id: "rest-1",
  slug: "demo",
  name: "Demo",
  logo_url: null,
  primary_color: "#111",
  slider_images: [],
  welcome_bg_url: null,
  instagram: null,
};

const SCHEDULE = {
  starts_on: null,
  ends_on: null,
  windows: [{ days: [1, 2, 3, 4, 5], start: "07:00", end: "11:00" }],
  outside: "show",
};

/**
 * Sahte Supabase: `schedule` kolonu seçilirse ve `schemaHasSchedule=false` ise canlıdaki
 * "migration henüz uygulanmadı" hatasını (42703) döndürür.
 */
function fakeClient(schemaHasSchedule: boolean) {
  const selects: { table: string; columns: string }[] = [];

  const rowsFor = (table: string, columns: string) => {
    const withSchedule = columns.includes("schedule");
    const maybe = (row: Record<string, unknown>) => (withSchedule ? { ...row, schedule: SCHEDULE } : row);
    switch (table) {
      case "categories":
        return [maybe({ id: "cat-1", name: "Kahve", name_en: null, name_ru: null, main_group: "İÇECEK", main_group_en: null, main_group_ru: null, sort_order: 0 })];
      case "menu_collections":
        return [
          maybe({
            id: "mc-1", name: "Kahvaltı", name_en: null, name_ru: null, description: null,
            start_time: null, end_time: null, sort_order: 0,
            card_visual_type: columns.includes("card_visual_type") ? "image" : undefined,
            card_image_url: columns.includes("card_visual_type") ? "https://x/y.webp" : undefined,
          }),
        ];
      case "products":
        return [
          maybe({
            id: "prod-1", category_id: "cat-1", name: "Latte", name_en: null, name_ru: null,
            description: null, description_en: null, description_ru: null, price: "120",
            image_url: null, allergens: [], sort_order: 0, created_at: "2026-01-01T00:00:00Z",
          }),
        ];
      case "category_menu_collections":
        return [{ category_id: "cat-1", menu_collection_id: "mc-1" }];
      default:
        return [];
    }
  };

  const client = {
    from(table: string) {
      let columns = "";
      const builder = {
        select(cols: string) { columns = cols; return builder; },
        eq() { return builder; },
        neq() { return builder; },
        in() { return builder; },
        order() { return builder; },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          selects.push({ table, columns });
          const missing = !schemaHasSchedule && columns.split(",").map((c) => c.trim()).includes("schedule");
          const result = missing
            ? { data: null, error: { code: "42703", message: `column ${table}.schedule does not exist` } }
            : { data: rowsFor(table, columns), error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, selects };
}

describe("public menu loading around the schedule migration", () => {
  it("migration NOT applied: menu still loads, schedule is null, older columns (card visual) are kept", async () => {
    const { client } = fakeClient(false);
    const menu = await buildPublicMenuFull(client, restaurant);

    assert.equal(menu.categories.length, 1);
    assert.equal(menu.products.length, 1);
    assert.equal(menu.menu_collections.length, 1);
    assert.equal(menu.categories[0].schedule ?? null, null);
    assert.equal(menu.products[0].schedule ?? null, null);
    assert.equal(menu.menu_collections[0].schedule ?? null, null);
    assert.equal(menu.menu_collections[0].card_visual_type, "image", "kart görseli korunmalı");
  });

  it("migration applied: schedules reach the payload", async () => {
    const { client } = fakeClient(true);
    const menu = await buildPublicMenuFull(client, restaurant);
    assert.deepEqual(menu.categories[0].schedule, SCHEDULE);
    assert.deepEqual(menu.products[0].schedule, SCHEDULE);
    assert.deepEqual(menu.menu_collections[0].schedule, SCHEDULE);
  });
});
