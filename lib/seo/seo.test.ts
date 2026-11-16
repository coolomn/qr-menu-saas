import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seoSurfaceForHost } from "./host-surface";
import {
  absoluteHttpUrl,
  buildMenuItemJsonLd,
  buildRestaurantJsonLd,
  isAmbiguousPriceText,
  serializeJsonLd,
} from "./json-ld";
import { isSeoVisible, shouldNoIndex, toMenuSeoInfo, type MenuSeoResult } from "./menu-seo";
import { isMissingColumnError } from "./db-errors";
import { buildSeoHeaderRules, SITEMAP_CACHE_CONTROL } from "./headers";
import { isSitemapRestaurant, loadMenuSitemapEntries, SitemapDataError } from "./sitemap-data";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("seoSurfaceForHost", () => {
  it("maps production hosts to their surface", () => {
    assert.equal(seoSurfaceForHost("qr.tapmenu.com.tr"), "menu");
    assert.equal(seoSurfaceForHost("QR.TapMenu.com.tr:443"), "menu");
    assert.equal(seoSurfaceForHost("app.tapmenu.com.tr"), "app");
    assert.equal(seoSurfaceForHost("tapmenu.com.tr"), "marketing");
    assert.equal(seoSurfaceForHost("www.tapmenu.com.tr"), "marketing");
  });

  it("keeps test, preview and local hosts private (never indexed)", () => {
    assert.equal(seoSurfaceForHost("qr-test.tapmenu.com.tr"), "private");
    assert.equal(seoSurfaceForHost("qr-menu-saas-abc.vercel.app"), "private");
    assert.equal(seoSurfaceForHost("localhost:3000"), "private");
    assert.equal(seoSurfaceForHost(null), "private");
  });
});

describe("serializeJsonLd", () => {
  it("escapes characters that could break out of the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script> & <b>" });
    assert.ok(!out.includes("<"), out);
    assert.ok(!out.includes(">"), out);
    assert.ok(!out.includes("&"), out);
    // Kaçışlı hâl geri çözülünce özgün metin korunur.
    assert.equal(JSON.parse(out).name, "</script><script>alert(1)</script> & <b>");
  });
});

describe("absoluteHttpUrl", () => {
  it("resolves relative paths and rejects non-http schemes", () => {
    assert.equal(absoluteHttpUrl("/logo.png", "https://qr.tapmenu.com.tr/x"), "https://qr.tapmenu.com.tr/logo.png");
    assert.equal(absoluteHttpUrl("https://cdn.example.com/a.jpg", "https://x.com"), "https://cdn.example.com/a.jpg");
    assert.equal(absoluteHttpUrl("javascript:alert(1)", "https://x.com"), null);
    assert.equal(absoluteHttpUrl("  ", "https://x.com"), null);
    assert.equal(absoluteHttpUrl(null, "https://x.com"), null);
  });
});

const BASE_HOURS = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { closed: false, open: "09:00", close: "23:00" }])
);

describe("buildRestaurantJsonLd", () => {
  it("builds a Restaurant with menu link, sameAs and opening hours", () => {
    const ld = buildRestaurantJsonLd({
      name: "Ada Cafe",
      url: "https://qr.tapmenu.com.tr/ada",
      logoUrl: "https://cdn.example.com/logo.png",
      instagram: "@adacafe",
      socialLinks: { facebook: "adacafe" },
      openingHours: { ...BASE_HOURS, sun: { closed: true, open: "09:00", close: "23:00" } },
    });
    assert.equal(ld["@type"], "Restaurant");
    assert.equal(ld.hasMenu, "https://qr.tapmenu.com.tr/ada");
    assert.deepEqual(ld.sameAs, ["https://www.instagram.com/adacafe/", "https://www.facebook.com/adacafe"]);
    const spec = ld.openingHoursSpecification as { dayOfWeek: string }[];
    assert.equal(spec.length, 6);
    assert.ok(!spec.some((s) => s.dayOfWeek === "Sunday"));
  });

  it("omits optional fields when data is missing or invalid", () => {
    const ld = buildRestaurantJsonLd({ name: "X", url: "https://qr.tapmenu.com.tr/x", openingHours: { broken: true } });
    assert.equal("image" in ld, false);
    assert.equal("sameAs" in ld, false);
    assert.equal("openingHoursSpecification" in ld, false);
  });

  it("treats identical open/close as all-day", () => {
    const ld = buildRestaurantJsonLd({
      name: "X",
      url: "https://qr.tapmenu.com.tr/x",
      openingHours: { ...BASE_HOURS, mon: { closed: false, open: "00:00", close: "00:00" } },
    });
    const mon = (ld.openingHoursSpecification as { dayOfWeek: string; opens: string; closes: string }[]).find(
      (s) => s.dayOfWeek === "Monday"
    );
    assert.deepEqual([mon?.opens, mon?.closes], ["00:00", "23:59"]);
  });
});

describe("buildMenuItemJsonLd", () => {
  const url = "https://qr.tapmenu.com.tr/ada/p/1";

  it("builds price, diet, nutrition and availability", () => {
    const ld = buildMenuItemJsonLd({
      name: "Falafel",
      description: " Nohut köftesi ",
      url,
      imageUrl: "https://cdn.example.com/f.jpg",
      price: "1.250,50 ₺",
      badges: ["vegan"],
      calories: 320.4,
      proteinG: 12,
    });
    assert.equal(ld["@type"], "MenuItem");
    assert.equal(ld.description, "Nohut köftesi");
    assert.deepEqual(ld.offers, {
      "@type": "Offer",
      price: "1250.50",
      priceCurrency: "TRY",
      availability: "https://schema.org/InStock",
    });
    assert.deepEqual(ld.suitableForDiet, ["https://schema.org/VeganDiet", "https://schema.org/VegetarianDiet"]);
    assert.deepEqual(ld.nutrition, { "@type": "NutritionInformation", calories: "320 calories", proteinContent: "12 g" });
  });

  it("marks sold-out items OutOfStock", () => {
    const ld = buildMenuItemJsonLd({ name: "A", url, price: "50", soldOut: true });
    assert.equal((ld.offers as { availability: string }).availability, "https://schema.org/OutOfStock");
  });

  it("uses an AggregateOffer for sized products even though products.price holds the lowest variant", () => {
    const ld = buildMenuItemJsonLd({ name: "Pizza", url, price: "200", variantPrices: ["200", "260 TL", "garip", null] });
    assert.deepEqual(ld.offers, {
      "@type": "AggregateOffer",
      lowPrice: "200.00",
      highPrice: "260.00",
      priceCurrency: "TRY",
      offerCount: 2,
      availability: "https://schema.org/InStock",
    });
  });

  it("uses a plain Offer when all variants share one price", () => {
    const ld = buildMenuItemJsonLd({ name: "Pizza", url, price: "200", variantPrices: ["200", "200"] });
    assert.equal((ld.offers as { "@type": string })["@type"], "Offer");
  });

  it("omits offers when the price is unclear (never publishes a wrong price)", () => {
    for (const price of ["Sorunuz", "120-150", "", null, "0"]) {
      const ld = buildMenuItemJsonLd({ name: "A", url, price });
      assert.equal("offers" in ld, false, `price=${price}`);
    }
  });

  it("skips ambiguous prices like 1,250 (decimal in TR, thousands in EN)", () => {
    assert.equal(isAmbiguousPriceText("1,250"), true);
    assert.equal(isAmbiguousPriceText("1,25"), false);
    assert.equal(isAmbiguousPriceText("1.250,50"), false);
    assert.equal("offers" in buildMenuItemJsonLd({ name: "A", url, price: "1,250 ₺" }), false);
    assert.equal(
      (buildMenuItemJsonLd({ name: "A", url, price: "1,25 ₺" }).offers as { price: string }).price,
      "1.25"
    );
  });

  it("omits nutrition and diet when absent", () => {
    const ld = buildMenuItemJsonLd({ name: "A", url, price: "10" });
    assert.equal("nutrition" in ld, false);
    assert.equal("suitableForDiet" in ld, false);
  });
});

describe("menu seo visibility", () => {
  const row = { name: "Ada", tenant_status: "active", subscription_ends_at: null };

  it("is visible by default (column missing or true)", () => {
    assert.equal(isSeoVisible(toMenuSeoInfo(row)), true);
    assert.equal(isSeoVisible(toMenuSeoInfo({ ...row, seo_indexable: true })), true);
  });

  it("hides when owner turned it off, subscription ended, suspended, or unknown", () => {
    assert.equal(isSeoVisible(toMenuSeoInfo({ ...row, seo_indexable: false })), false);
    assert.equal(isSeoVisible(toMenuSeoInfo({ ...row, tenant_status: "expired" })), false);
    assert.equal(isSeoVisible(toMenuSeoInfo({ ...row, tenant_status: "suspended" })), false);
    assert.equal(isSeoVisible(toMenuSeoInfo({ ...row, subscription_ends_at: "2020-01-01T00:00:00Z" })), false);
    assert.equal(isSeoVisible(toMenuSeoInfo({ ...row, name: "  " })), false);
    assert.equal(isSeoVisible(null), false);
  });
});

describe("isSitemapRestaurant", () => {
  it("includes only indexable, unblocked restaurants with a slug", () => {
    assert.equal(isSitemapRestaurant({ slug: "ada" }), true);
    assert.equal(isSitemapRestaurant({ slug: "ada", seo_indexable: true, tenant_status: "active" }), true);
    assert.equal(isSitemapRestaurant({ slug: "ada", seo_indexable: false }), false);
    assert.equal(isSitemapRestaurant({ slug: "ada", tenant_status: "expired" }), false);
    assert.equal(isSitemapRestaurant({ slug: "ada", subscription_ends_at: "2020-01-01T00:00:00Z" }), false);
    assert.equal(isSitemapRestaurant({ slug: "  " }), false);
  });
});

describe("shouldNoIndex", () => {
  const found = (extra: Record<string, unknown> = {}): MenuSeoResult => ({
    status: "found",
    info: toMenuSeoInfo({ name: "Ada", tenant_status: "active", subscription_ends_at: null, ...extra }),
  });

  it("noindex only for verified closed/unknown states", () => {
    assert.equal(shouldNoIndex(found()), false);
    assert.equal(shouldNoIndex(found({ seo_indexable: false })), true);
    assert.equal(shouldNoIndex(found({ tenant_status: "expired" })), true);
    assert.equal(shouldNoIndex({ status: "not_found" }), true);
  });

  it("never turns a transient read error into noindex", () => {
    assert.equal(shouldNoIndex({ status: "error" }), false);
  });
});

describe("isMissingColumnError", () => {
  it("matches only missing-column errors", () => {
    assert.equal(isMissingColumnError({ code: "42703" }), true);
    assert.equal(isMissingColumnError({ message: "column restaurants.seo_indexable does not exist" }), true);
    assert.equal(isMissingColumnError({ message: "Could not find the column in the schema cache" }), true);
    assert.equal(isMissingColumnError({ message: "fetch failed" }), false);
    assert.equal(isMissingColumnError({ code: "57014", message: "statement timeout" }), false);
  });
});

describe("buildSeoHeaderRules", () => {
  it("caches the qr sitemap and marks API responses noindex", () => {
    const rules = buildSeoHeaderRules();
    const sitemap = rules.find((r) => r.source === "/sitemap.xml");
    assert.ok(sitemap);
    assert.deepEqual(sitemap.has, [{ type: "host", value: "qr\\.tapmenu\\.com\\.tr" }]);
    assert.equal(sitemap.headers[0].value, SITEMAP_CACHE_CONTROL);
    const api = rules.find((r) => r.source === "/api/:path*");
    assert.equal(api?.headers[0].key, "X-Robots-Tag");
  });
});

// --- sitemap veri okuması (sahte Supabase istemcisi) ---
type Table = Record<string, unknown>[];
type FakeOptions = {
  tables: Record<string, Table>;
  /** tablo.kolonlar → hata (ör. seo_indexable'lı restaurants sorgusu). */
  failWhen?: (table: string, columns: string) => { message?: string; code?: string } | null;
  pageLimit?: number;
};

function fakeClient({ tables, failWhen, pageLimit }: FakeOptions): SupabaseClient {
  return {
    from(table: string) {
      let columns = "";
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const builder = {
        select(c: string) {
          columns = c;
          return builder;
        },
        in(col: string, values: unknown[]) {
          filters.push((r) => values.includes(r[col]));
          return builder;
        },
        neq(col: string, value: unknown) {
          filters.push((r) => r[col] !== value);
          return builder;
        },
        eq(col: string, value: unknown) {
          filters.push((r) => r[col] === value);
          return builder;
        },
        order() {
          return builder;
        },
        range(from: number, to: number) {
          const error = failWhen?.(table, columns) ?? null;
          if (error) return Promise.resolve({ data: null, error });
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          const size = Math.min(to - from + 1, pageLimit ?? Number.POSITIVE_INFINITY);
          const wanted = columns.split(",").map((c) => c.trim());
          const projected = rows
            .slice(from, from + size)
            .map((r) => Object.fromEntries(wanted.filter((c) => c in r).map((c) => [c, r[c]])));
          return Promise.resolve({ data: projected, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const baseTables = (): Record<string, Table> => ({
  restaurants: [
    { id: "r1", slug: "ada", seo_indexable: true, tenant_status: "active" },
    { id: "r2", slug: "oda-servisi", seo_indexable: false, tenant_status: "active" },
    { id: "r3", slug: "bitti", seo_indexable: true, tenant_status: "expired" },
  ],
  categories: [
    { id: "c1", restaurant_id: "r1", is_active: true },
    { id: "c2", restaurant_id: "r1", is_active: false },
    { id: "c3", restaurant_id: "r2", is_active: true },
  ],
  products: [
    { id: "p1", category_id: "c1", restaurant_id: "r1", is_active: true },
    { id: "p2", category_id: "c1", restaurant_id: "r1", is_active: false },
    { id: "p3", category_id: "c2", restaurant_id: "r1", is_active: true },
    { id: "p4", category_id: "c3", restaurant_id: "r2", is_active: true },
  ],
});

describe("loadMenuSitemapEntries", () => {
  it("lists only eligible menus and active products in active categories", async () => {
    const urls = (await loadMenuSitemapEntries(fakeClient({ tables: baseTables() }))).map((e) => e.url);
    assert.deepEqual(urls, ["https://qr.tapmenu.com.tr/ada", "https://qr.tapmenu.com.tr/ada/p/p1"]);
  });

  it("reads past max_rows-limited pages until an empty page", async () => {
    const tables = baseTables();
    tables.products = Array.from({ length: 2500 }, (_, i) => ({
      id: `p${i}`,
      category_id: "c1",
      restaurant_id: "r1",
      is_active: true,
    }));
    const urls = await loadMenuSitemapEntries(fakeClient({ tables, pageLimit: 400 }));
    assert.equal(urls.length, 1 + 2500);
  });

  it("falls back without seo_indexable only when the column is missing", async () => {
    const tables = baseTables();
    const urls = (
      await loadMenuSitemapEntries(
        fakeClient({
          tables,
          failWhen: (table, columns) =>
            table === "restaurants" && columns.includes("seo_indexable")
              ? { message: "column restaurants.seo_indexable does not exist", code: "42703" }
              : null,
        })
      )
    ).map((e) => e.url);
    // Kolon yokken (migration öncesi) herkes açık sayılır; süresi biten yine yok.
    assert.ok(urls.includes("https://qr.tapmenu.com.tr/ada"));
    assert.ok(urls.includes("https://qr.tapmenu.com.tr/oda-servisi"));
    assert.ok(!urls.includes("https://qr.tapmenu.com.tr/bitti"));
  });

  it("fails (never leaks opted-out menus) on any other read error", async () => {
    await assert.rejects(
      loadMenuSitemapEntries(
        fakeClient({
          tables: baseTables(),
          failWhen: (table, columns) =>
            table === "restaurants" && columns.includes("seo_indexable")
              ? { message: "canceling statement due to statement timeout", code: "57014" }
              : null,
        })
      ),
      SitemapDataError
    );
  });

  it("fails instead of publishing a partial sitemap when products cannot be read", async () => {
    await assert.rejects(
      loadMenuSitemapEntries(
        fakeClient({
          tables: baseTables(),
          failWhen: (table) => (table === "products" ? { message: "fetch failed" } : null),
        })
      ),
      SitemapDataError
    );
  });
});
