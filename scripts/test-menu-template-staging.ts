/**
 * Faz 2.11c şablon menü yüklemesi uçtan uca testi — SADECE STAGING.
 * Kullanım: set -a; . ./.env.staging.local; set +a; node --import tsx scripts/test-menu-template-staging.ts
 *
 * Geçici sahip + restoranlar oluşturur; gerçek RLS'li sahip oturumuyla şablonu yükler; veritabanında,
 * tetikleyicilerde ve müşteri menüsü yükleyicisinde sonucu doğrular; başka tenant'a ve kilitli
 * (aboneliği bitmiş) restorana yazılamadığını kanıtlar; en sonda her şeyi siler. Sırlar yazdırılmaz.
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { applyMenuTemplate } from "../lib/menu-templates/apply";
import { MENU_TEMPLATES, countTemplateProducts, getMenuTemplate } from "../lib/menu-templates/templates";
import { buildPublicMenuFull, loadPublicMenuRestaurantBySlug } from "../lib/public-menu/load-public-menu";

const STAGING_REF = "nslzwigdblleanptchvs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (url !== `https://${STAGING_REF}.supabase.co` || !anonKey || !serviceKey) {
  console.error("DURDURULDU: yalnızca staging ile çalışır.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const results: { name: string; pass: boolean; detail?: string }[] = [];
const record = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function count(table: "categories" | "products", restaurantId: string): Promise<number> {
  const { count: n, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId);
  if (error) throw error;
  return n ?? 0;
}

async function main() {
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `tpl-test-${suffix}@example.com`;
  const password = crypto.randomBytes(18).toString("base64url");
  const userIds: string[] = [];
  const restaurantIds: string[] = [];

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
    const ownerId = created.user.id;
    userIds.push(ownerId);

    const { data: other, error: otherErr } = await admin.auth.admin.createUser({
      email: `tpl-other-${suffix}@example.com`,
      password: crypto.randomBytes(18).toString("base64url"),
      email_confirm: true,
    });
    if (otherErr) throw new Error(`createUser other: ${otherErr.message}`);
    userIds.push(other.user.id);

    const mk = async (label: string, owner: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await admin
        .from("restaurants")
        .insert({ name: `Tpl ${label} ${suffix}`, slug: `tpl-${label}-${suffix}`, owner_id: owner, ...extra })
        .select("id, slug")
        .single();
      if (error) throw new Error(`insert restaurant ${label}: ${error.message}`);
      restaurantIds.push(data.id);
      return data as { id: string; slug: string };
    };

    const mine = await mk("mine", ownerId);
    const lockedOwn = await mk("locked", ownerId, {
      tenant_status: "expired",
      subscription_ends_at: new Date(Date.now() - 86400000).toISOString(),
    });
    const foreign = await mk("foreign", other.user.id);
    // Yabancı tenant'a önceden bir kategori koy: yazma girişimi sonrası sayısı değişmemeli.
    const seed = await admin.from("categories").insert({ name: "Mevcut", restaurant_id: foreign.id });
    if (seed.error) throw new Error(`seed foreign: ${seed.error.message}`);
    const foreignBefore = await count("categories", foreign.id);

    const owner = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await owner.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error(`signIn: ${signInErr.message}`);

    // 1) Üç şablon da gerçek DB'ye (RLS'li sahip oturumuyla) yüklenebilmeli; her biri kendi boş restoranına.
    for (const template of MENU_TEMPLATES) {
      const target = template.id === "cafe" ? mine : await mk(template.id, ownerId);
      const result = await applyMenuTemplate(owner, target.id, template);
      record(`owner can load "${template.id}" template`, result.ok, result.ok ? "" : result.message);
      if (!result.ok) continue;
      const cats = await count("categories", target.id);
      const prods = await count("products", target.id);
      record(
        `"${template.id}" row counts match`,
        cats === template.categories.length && prods === countTemplateProducts(template),
        `${cats} kategori / ${prods} ürün`
      );
    }

    // 2) Tetikleyiciler: translations → name_en/description_en eşitlenmiş mi, varsayılanlar doğru mu?
    {
      const { data: p, error } = await admin
        .from("products")
        .select("name, name_en, description_en, translations, price, allergens, badges, is_active, sort_order")
        .eq("restaurant_id", mine.id)
        .eq("name", "Cappuccino")
        .single();
      assert.ifError(error);
      record(
        "legacy name_en/description_en synced by trigger",
        p!.name_en === "Cappuccino" && p!.description_en === "Espresso, milk and milk foam.",
        `${p!.name_en} / ${p!.description_en}`
      );
      record(
        "prices/allergens/badges empty, product active",
        p!.price === "" && (p!.allergens as string[]).length === 0 && (p!.badges as string[]).length === 0 && p!.is_active === true
      );
      const { data: c } = await admin.from("categories").select("name_en, main_group, translations").eq("restaurant_id", mine.id).eq("name", "Sıcak İçecekler").single();
      record(
        "category EN + main group translated",
        c!.name_en === "Hot Drinks" && c!.main_group === "İÇECEKLER" && (c!.translations as { en: { main_group: string } }).en.main_group === "DRINKS"
      );
    }

    // 3) Müşteri menüsü yükleyicisi şablon içeriğini görüyor mu?
    {
      const loaded = await loadPublicMenuRestaurantBySlug(admin, mine.slug);
      assert.ok(loaded.ok);
      const full = await buildPublicMenuFull(admin, loaded.restaurant);
      const cafe = getMenuTemplate("cafe")!;
      record(
        "public menu loader returns the template content",
        full.categories.length === cafe.categories.length && full.products.length === countTemplateProducts(cafe),
        `${full.categories.length} kategori / ${full.products.length} ürün`
      );
    }

    // 4) Dolu menüye ikinci yükleme reddedilmeli, hiçbir şey eklenmemeli.
    {
      const before = { c: await count("categories", mine.id), p: await count("products", mine.id) };
      const again = await applyMenuTemplate(owner, mine.id, getMenuTemplate("restaurant")!);
      const after = { c: await count("categories", mine.id), p: await count("products", mine.id) };
      record(
        "second load into a filled menu is refused",
        !again.ok && again.reason === "not_empty" && before.c === after.c && before.p === after.p
      );
    }

    // 5) Başka tenant'ın restoranına yazılamamalı (RLS), mevcut içerik değişmemeli.
    {
      const attempt = await applyMenuTemplate(owner, foreign.id, getMenuTemplate("cafe")!);
      const foreignAfter = await count("categories", foreign.id);
      record(
        "owner cannot load a template into another tenant's restaurant",
        !attempt.ok && foreignAfter === foreignBefore && (await count("products", foreign.id)) === 0,
        attempt.ok ? "WRITTEN" : attempt.reason
      );
    }

    // 6) Aboneliği bitmiş (kilitli) kendi restoranına yazılamamalı.
    {
      const attempt = await applyMenuTemplate(owner, lockedOwn.id, getMenuTemplate("cafe")!);
      const wrote = (await count("categories", lockedOwn.id)) + (await count("products", lockedOwn.id));
      record("expired (locked) tenant cannot load a template", !attempt.ok && wrote === 0, attempt.ok ? "WRITTEN" : attempt.reason);
    }

    // 7) Taslak (Bar): otel şablonunda kategori ve ürünleri yayında gelmemeli, gerçek DB'de de.
    {
      const hotelRest = restaurantIds.length > 0 ? await admin.from("restaurants").select("id").like("slug", `tpl-hotel-${suffix}`).single() : null;
      const hotelId = hotelRest?.data?.id as string;
      const { data: bar } = await admin.from("categories").select("id, is_active").eq("restaurant_id", hotelId).eq("name", "Bar").single();
      const { data: barProducts } = await admin.from("products").select("is_active").eq("category_id", bar!.id);
      const { data: others } = await admin.from("categories").select("is_active").eq("restaurant_id", hotelId).neq("name", "Bar");
      record(
        "draft Bar category + products are unpublished, the rest published",
        bar!.is_active === false && (barProducts ?? []).length === 4 && (barProducts ?? []).every((p) => p.is_active === false) && (others ?? []).every((c) => c.is_active === true)
      );
    }

    // 8) Gerçek DB'de eşzamanlı iki yükleme: yalnız biri kazanmalı, menü iki kat dolmamalı (sabit kök kimlik → 23505).
    {
      const race = await mk("race", ownerId);
      const [a, b] = await Promise.all([
        applyMenuTemplate(owner, race.id, getMenuTemplate("cafe")!),
        applyMenuTemplate(owner, race.id, getMenuTemplate("restaurant")!),
      ]);
      const winners = [a, b].filter((r) => r.ok);
      const winnerTemplate = a.ok ? getMenuTemplate("cafe")! : getMenuTemplate("restaurant")!;
      const cats = await count("categories", race.id);
      const prods = await count("products", race.id);
      record(
        "two simultaneous loads: exactly one wins, menu not doubled",
        winners.length === 1 && cats === winnerTemplate.categories.length && prods === countTemplateProducts(winnerTemplate),
        `${winners.length} kazanan, ${cats} kategori / ${prods} ürün`
      );
      const loser = a.ok ? b : a;
      record("the loser is told the menu is not empty", !loser.ok && loser.reason === "not_empty", loser.ok ? "ALSO OK" : loser.reason);
    }
  } finally {
    // Temizlik: ürünler → kategoriler → restoranlar → kullanıcılar (FK sırası).
    if (restaurantIds.length > 0) {
      await admin.from("products").delete().in("restaurant_id", restaurantIds);
      await admin.from("categories").delete().in("restaurant_id", restaurantIds);
      await admin.from("restaurants").delete().in("id", restaurantIds);
    }
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
    console.log("temizlendi");
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
