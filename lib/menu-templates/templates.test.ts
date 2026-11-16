import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMenuHealth } from "@/lib/admin-menu/menu-health";
import { cleanTranslationsForSave } from "@/lib/i18n/edit-translations";
import { saveLimits } from "@/lib/i18n/translatable";
import { applyMenuTemplate, buildTemplateRows, templateRootCategoryId } from "./apply";
import { MENU_TEMPLATES, TEMPLATE_GROUPS, countTemplateProducts, getMenuTemplate } from "./templates";

const RESTAURANT = "rest-1";
const RESTAURANT_UUID = "3b6f1c2e-9a4d-4e8b-b7c1-0a1b2c3d4e5f";

describe("template content", () => {
  it("ships cafe, restaurant and hotel templates", () => {
    assert.deepEqual(MENU_TEMPLATES.map((t) => t.id), ["cafe", "restaurant", "hotel"]);
    assert.equal(getMenuTemplate("cafe")?.title, "Kafe");
    assert.equal(getMenuTemplate("yok"), null);
  });

  for (const template of MENU_TEMPLATES) {
    describe(`template ${template.id}`, () => {
      it("has enough categories and products", () => {
        assert.ok(template.categories.length >= 4, "kategori sayısı");
        assert.ok(countTemplateProducts(template) >= 20, "ürün sayısı");
        for (const c of template.categories) assert.ok(c.products.length >= 3, `${c.name} en az 3 ürün`);
      });

      it("has Turkish and English text everywhere, within sensible lengths", () => {
        for (const c of template.categories) {
          for (const text of [c.name, c.name_en]) {
            assert.ok(text.trim() !== "" && text.length <= 60, `kategori: ${text}`);
          }
          for (const p of c.products) {
            for (const text of [p.name, p.name_en]) assert.ok(text.trim() !== "" && text.length <= 60, `ürün: ${text}`);
            for (const text of [p.description, p.description_en]) {
              // ≥10 karakter: menü sağlık skoru "açıklama var" sayar.
              assert.ok(text.trim().length >= 10 && text.length <= 120, `açıklama: ${p.name} / ${text}`);
            }
          }
        }
      });

      it("has no duplicate category names or duplicate product names within a category", () => {
        const categoryNames = template.categories.map((c) => c.name);
        assert.equal(new Set(categoryNames).size, categoryNames.length);
        for (const c of template.categories) {
          const names = c.products.map((p) => p.name);
          assert.equal(new Set(names).size, names.length, `${c.name} içinde tekrar`);
        }
      });

      it("makes no price or marketing/diet/origin claims in descriptions", () => {
        // Unicode farkındalıklı sınır: "ev yapımı" gibi ASCII dışı harfli ifadeler de yakalanır.
        const claims = /(?<![\p{L}])(vegan|vejetaryen|glutensiz|gluten-free|laktozsuz|organik|organic|helal|halal|taze|fresh|homemade|ev yapımı|yerli|imported)(?![\p{L}])/iu;
        assert.ok(claims.test("Bu ürün ev yapımı"), "regex kendini doğrulamalı");
        assert.ok(!claims.test("Tavuk"), "regex yanlış eşleşmemeli");
        for (const c of template.categories) {
          for (const p of c.products) {
            for (const text of [p.description, p.description_en]) {
              assert.ok(!/[₺$€]|\bTL\b|\d{2,}/.test(text), `rakam/fiyat: ${p.name}`);
              assert.ok(!claims.test(text), `iddia: ${p.name} / ${text}`);
            }
          }
        }
      });
    });
  }
});

describe("buildTemplateRows", () => {
  const counter = () => {
    let n = 0;
    return () => `id-${++n}`;
  };

  for (const template of MENU_TEMPLATES) {
    it(`builds consistent rows for ${template.id}`, () => {
      const { categories, products } = buildTemplateRows(template, RESTAURANT, counter());
      assert.equal(categories.length, template.categories.length);
      assert.equal(products.length, countTemplateProducts(template));
      assert.equal(new Set([...categories, ...products].map((r) => r.id)).size, categories.length + products.length);

      assert.deepEqual(categories.map((c) => c.sort_order), categories.map((_, i) => i));
      const categoryIds = new Set(categories.map((c) => c.id));
      for (const p of products) {
        assert.ok(categoryIds.has(p.category_id));
        assert.equal(p.restaurant_id, RESTAURANT);
        assert.equal(p.price, "");
        assert.deepEqual(p.allergens, []);
        assert.deepEqual(p.badges, []);
        const category = categories.find((c) => c.id === p.category_id)!;
        assert.equal(p.is_active, category.is_active, "ürün, kategorisiyle aynı yayın durumunda");
      }
      // Kategori içinde ürün sırası 0..n-1.
      for (const id of categoryIds) {
        const orders = products.filter((p) => p.category_id === id).map((p) => p.sort_order);
        assert.deepEqual(orders, orders.map((_, i) => i));
      }
    });
  }

  it("uses a fixed, restaurant-derived id for the first category (guards against concurrent loads)", () => {
    const root = templateRootCategoryId(RESTAURANT_UUID);
    assert.equal(root, "3b6f1c2e-9a4d-5e8b-b7c1-0a1b2c3d4e5f");
    assert.notEqual(root, RESTAURANT_UUID);
    assert.equal(root.length, 36);
    // Rastgele (v4) kimliklerle çakışamaz: 14. karakter 4 değil, 5.
    assert.equal(root[14], "5");
    const ids = MENU_TEMPLATES.map((t) => buildTemplateRows(t, RESTAURANT_UUID, counter()).categories[0].id);
    assert.ok(ids.every((id) => id === root), "her şablonda aynı kök kimlik");
    // Başka restoran → başka kök.
    assert.notEqual(templateRootCategoryId("11111111-1111-4111-8111-111111111111"), root);
    // Yalnızca ilk kategori sabit; diğerleri rastgele.
    const rows = buildTemplateRows(getMenuTemplate("restaurant")!, RESTAURANT_UUID, counter());
    assert.deepEqual(rows.categories.slice(1).filter((c) => c.id === root), []);
  });

  it("ships draft categories (Bar) unpublished, with their products", () => {
    const { categories, products } = buildTemplateRows(getMenuTemplate("hotel")!, RESTAURANT, counter());
    const bar = categories.find((c) => c.name === "Bar")!;
    assert.equal(bar.is_active, false);
    assert.ok(products.filter((p) => p.category_id === bar.id).every((p) => p.is_active === false));
    assert.ok(categories.filter((c) => c.name !== "Bar").every((c) => c.is_active === true));
    assert.equal(getMenuTemplate("cafe")!.categories.some((c) => c.draft), false);
  });

  it("maps groups to the standard main-group names with English translations", () => {
    const { categories } = buildTemplateRows(getMenuTemplate("cafe")!, RESTAURANT, counter());
    const hot = categories.find((c) => c.name === "Sıcak İçecekler")!;
    assert.equal(hot.main_group, TEMPLATE_GROUPS.drinks.tr);
    assert.deepEqual(hot.translations, { en: { name: "Hot Drinks", main_group: "DRINKS" } });
    const dessert = categories.find((c) => c.name === "Tatlılar")!;
    assert.equal(dessert.main_group, "YİYECEKLER");
    assert.equal(dessert.translations.en.main_group, "FOOD");
  });

  it("translations survive the same cleaning the admin forms apply (limits, shape)", () => {
    const { categories, products } = buildTemplateRows(getMenuTemplate("restaurant")!, RESTAURANT, counter());
    for (const c of categories) {
      assert.deepEqual(cleanTranslationsForSave(c.translations, saveLimits("category")), c.translations);
    }
    for (const p of products) {
      assert.deepEqual(cleanTranslationsForSave(p.translations, saveLimits("product")), p.translations);
    }
  });

  it("gives a menu that is complete for descriptions and English but still needs prices and photos", () => {
    for (const template of MENU_TEMPLATES) {
      const { categories, products } = buildTemplateRows(template, RESTAURANT, counter());
      const health = computeMenuHealth({
        products,
        variantsByProduct: {},
        categories,
        translationLanguages: ["en"],
        venue: { hasLogo: false, hasOpeningHours: false, hasContact: false },
      });
      const byId = Object.fromEntries(health.checks.map((c) => [c.id, c]));
      assert.equal(byId.description.percent, 100, template.id);
      assert.equal(byId.translations.percent, 100, template.id);
      assert.equal(byId.price.percent, 0, template.id);
      assert.equal(byId.photo.percent, 0, template.id);
      assert.deepEqual(health.emptyCategories, []);
    }
  });
});

// --- applyMenuTemplate (sahte Supabase istemcisi) ---
type FakeOptions = {
  counts?: { categories: number; products: number };
  countError?: "categories" | "products";
  failInsert?: "categories" | "products";
  insertErrorMessage?: string;
  insertErrorCode?: string;
  failDelete?: "categories" | "products";
  /** Paylaşılan "veritabanı": kategori kimlikleri; aynı kimlik ikinci kez eklenirse 23505. */
  categoryIds?: Set<string>;
};

function fakeClient(options: FakeOptions, log: string[]): SupabaseClient {
  const counts = options.counts ?? { categories: 0, products: 0 };
  return {
    from(table: "categories" | "products") {
      const state: { head?: boolean; insert?: Record<string, unknown>[]; del?: boolean; ids?: string[] } = {};
      const builder = {
        select(_cols?: string, opts?: { head?: boolean }) {
          if (opts?.head) state.head = true;
          return builder;
        },
        eq() {
          return builder;
        },
        insert(rows: Record<string, unknown>[]) {
          state.insert = rows;
          log.push(`insert:${table}:${rows.length}`);
          return builder;
        },
        delete() {
          state.del = true;
          return builder;
        },
        in(_col: string, ids: string[]) {
          state.ids = ids;
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          if (state.del) {
            log.push(`delete:${table}:${state.ids?.length ?? 0}`);
            if (options.failDelete === table) return resolve({ error: { message: "delete boom" } });
            return resolve({ error: null });
          }
          if (state.head) {
            if (options.countError === table) return resolve({ count: null, error: { message: "boom" } });
            return resolve({ count: counts[table], error: null });
          }
          if (options.failInsert === table) {
            return resolve({ data: null, error: { message: options.insertErrorMessage ?? "insert boom", code: options.insertErrorCode } });
          }
          if (table === "categories" && options.categoryIds) {
            const ids = (state.insert ?? []).map((r) => String(r.id));
            if (ids.some((id) => options.categoryIds!.has(id))) {
              return resolve({ data: null, error: { message: "duplicate key value", code: "23505" } });
            }
            ids.forEach((id) => options.categoryIds!.add(id));
          }
          return resolve({ data: state.insert, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("applyMenuTemplate", () => {
  const template = getMenuTemplate("cafe")!;

  it("inserts categories then products into an empty menu and returns sorted rows", async () => {
    const log: string[] = [];
    const result = await applyMenuTemplate(fakeClient({}, log), RESTAURANT, template);
    assert.ok(result.ok);
    assert.deepEqual(log, [`insert:categories:${template.categories.length}`, `insert:products:${countTemplateProducts(template)}`]);
    if (result.ok) {
      assert.equal(result.categories.length, template.categories.length);
      assert.equal(result.products.length, countTemplateProducts(template));
      assert.deepEqual(result.categories.map((c) => c.sort_order), template.categories.map((_, i) => i));
    }
  });

  it("refuses to touch a menu that already has categories or products", async () => {
    for (const counts of [{ categories: 1, products: 0 }, { categories: 0, products: 3 }, { categories: 2, products: 9 }]) {
      const log: string[] = [];
      const result = await applyMenuTemplate(fakeClient({ counts }, log), RESTAURANT, template);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "not_empty");
      assert.deepEqual(log, [], "hiçbir yazma yapılmamalı");
    }
  });

  it("does not write when emptiness cannot be verified", async () => {
    for (const countError of ["categories", "products"] as const) {
      const log: string[] = [];
      const result = await applyMenuTemplate(fakeClient({ countError }, log), RESTAURANT, template);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "check_failed");
      assert.deepEqual(log, []);
    }
  });

  it("leaves nothing behind when the category insert fails", async () => {
    const log: string[] = [];
    const result = await applyMenuTemplate(fakeClient({ failInsert: "categories" }, log), RESTAURANT, template);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "insert_failed");
      assert.ok(result.message.includes("insert boom"));
    }
    assert.deepEqual(log, [`insert:categories:${template.categories.length}`]);
  });

  it("explains permission (RLS) failures in plain Turkish instead of a database message", async () => {
    const log: string[] = [];
    const result = await applyMenuTemplate(
      fakeClient({ failInsert: "categories", insertErrorMessage: 'new row violates row-level security policy for table "categories"' }, log),
      RESTAURANT,
      template
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.message.includes("yetkiniz yok"));
      assert.ok(!result.message.includes("row-level"));
    }
  });

  it("treats a duplicate key (concurrent load) as not-empty and does NOT roll back the other load's rows", async () => {
    const log: string[] = [];
    const result = await applyMenuTemplate(
      fakeClient({ failInsert: "categories", insertErrorCode: "23505", insertErrorMessage: "duplicate key" }, log),
      RESTAURANT_UUID,
      template
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_empty");
      assert.ok(result.message.includes("başka bir şablon"));
    }
    // Hiç silme yok: sabit kök kimlik diğer yüklemenin satırıdır.
    assert.deepEqual(log, [`insert:categories:${template.categories.length}`]);
  });

  it("lets exactly one of two simultaneous loads win; the loser writes and deletes nothing", async () => {
    const shared = new Set<string>();
    const logA: string[] = [];
    const logB: string[] = [];
    const [a, b] = await Promise.all([
      applyMenuTemplate(fakeClient({ categoryIds: shared }, logA), RESTAURANT_UUID, getMenuTemplate("cafe")!),
      applyMenuTemplate(fakeClient({ categoryIds: shared }, logB), RESTAURANT_UUID, getMenuTemplate("restaurant")!),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    const loser = losers[0];
    if (!loser.ok) assert.equal(loser.reason, "not_empty");
    const loserLog = a.ok ? logB : logA;
    assert.ok(!loserLog.some((l) => l.startsWith("delete:") || l.startsWith("insert:products")), loserLog.join(","));
  });

  it("reports a failed rollback honestly instead of claiming nothing changed", async () => {
    for (const failDelete of ["products", "categories"] as const) {
      const log: string[] = [];
      const result = await applyMenuTemplate(fakeClient({ failInsert: "products", failDelete }, log), RESTAURANT, template);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "rollback_failed");
        assert.ok(result.message.includes("geri alınamadı"));
        assert.ok(!result.message.includes("hiçbir değişiklik yapılmadı"));
      }
    }
  });

  it("explains a missing-schema error (migration not applied) clearly", async () => {
    const result = await applyMenuTemplate(
      fakeClient({ failInsert: "categories", insertErrorCode: "PGRST204", insertErrorMessage: "Could not find the 'translations' column of 'categories' in the schema cache" }, []),
      RESTAURANT,
      template
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.message.includes("Sistem güncellemesi"));
      assert.ok(!result.message.includes("translations"));
    }
  });

  it("rolls back products first, then categories, when the product insert fails", async () => {
    const log: string[] = [];
    const result = await applyMenuTemplate(fakeClient({ failInsert: "products" }, log), RESTAURANT, template);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "insert_failed");
    assert.deepEqual(log, [
      `insert:categories:${template.categories.length}`,
      `insert:products:${countTemplateProducts(template)}`,
      `delete:products:${countTemplateProducts(template)}`,
      `delete:categories:${template.categories.length}`,
    ]);
  });
});
