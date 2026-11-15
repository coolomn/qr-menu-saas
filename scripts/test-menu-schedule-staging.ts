/**
 * Faz 2.3 zamanlama uçtan uca testi — SADECE STAGING.
 * Kullanım: set -a; . ./.env.staging.local; set +a; node --import tsx scripts/test-menu-schedule-staging.ts <slug>
 * Akış: kategori/ürün/menüye geçerli + bozuk zamanlama yaz → gerçek public yükleyici okusun →
 * yedek (snapshot) zamanlamayı taşıyor mu → hepsini eski haline (null) döndür.
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { buildPublicMenuFull, loadPublicMenuRestaurantBySlug } from "../lib/public-menu/load-public-menu";
import { createMenuSnapshot } from "../lib/menu-snapshot";

const STAGING_REF = "nslzwigdblleanptchvs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url.includes(STAGING_REF) || !key) {
  console.error("DURDURULDU: yalnızca staging ile çalışır.");
  process.exit(1);
}
const slug = process.argv[2];
if (!slug) {
  console.error("slug gerekli");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const VALID = {
  starts_on: null,
  ends_on: null,
  windows: [{ days: [1, 2, 3, 4, 5], start: "07:00", end: "11:00" }],
  outside: "show",
};

async function main() {
  const { data: rest, error } = await admin.from("restaurants").select("id").eq("slug", slug).single();
  if (error || !rest) throw error ?? new Error("restoran yok");
  const rid = rest.id as string;

  const { data: cats } = await admin.from("categories").select("id").eq("restaurant_id", rid).order("sort_order").limit(1);
  const { data: prods } = await admin.from("products").select("id").eq("restaurant_id", rid).order("created_at").limit(2);
  const { data: menus } = await admin.from("menu_collections").select("id").eq("restaurant_id", rid).order("sort_order").limit(1);
  assert.ok(cats?.length && prods && prods.length >= 2 && menus?.length, "test verisi yetersiz");
  const [catId, prodA, prodB, menuId] = [cats[0].id, prods[0].id, prods[1].id, menus[0].id];

  const touched = { categories: [catId], products: [prodA, prodB], menu_collections: [menuId] };
  try {
    await admin.from("categories").update({ schedule: VALID }).eq("id", catId);
    await admin.from("products").update({ schedule: { ...VALID, outside: "hide" } }).eq("id", prodA);
    await admin.from("products").update({ schedule: { windows: "bozuk", starts_on: "2026-02-31" } }).eq("id", prodB);
    await admin.from("menu_collections").update({ schedule: VALID }).eq("id", menuId);

    const loaded = await loadPublicMenuRestaurantBySlug(admin, slug);
    assert.ok(loaded.ok, "restoran yüklenemedi");
    const full = await buildPublicMenuFull(admin, loaded.restaurant);

    const cat = full.categories.find((c) => c.id === catId);
    const a = full.products.find((p) => p.id === prodA);
    const b = full.products.find((p) => p.id === prodB);
    const menu = full.menu_collections.find((m) => m.id === menuId);
    assert.deepEqual(cat?.schedule, VALID, "kategori zamanlaması payload'da yok");
    assert.equal(a?.schedule?.outside, "hide", "ürün zamanlaması payload'da yok");
    assert.equal(b?.schedule ?? null, null, "bozuk zamanlama 'her zaman' sayılmalı");
    assert.deepEqual(menu?.schedule, VALID, "menü zamanlaması payload'da yok");
    // Zamanlaması olmayan hiçbir şey etkilenmemeli
    const others = full.products.filter((p) => p.id !== prodA && p.id !== prodB);
    assert.ok(others.every((p) => (p.schedule ?? null) === null), "başka ürünlere zamanlama sızdı");
    console.log("OK  public yükleyici: kategori/ürün/menü zamanlaması okundu, bozuk değer null oldu");

    const snap = await createMenuSnapshot(admin, rid, "schedule-test");
    assert.ok(snap.ok && snap.snapshotId, "yedek alınamadı");
    const { data: snapRow } = await admin.from("menu_snapshots").select("data").eq("id", snap.snapshotId).single();
    const snapCat = (snapRow?.data as { categories: { id: string; schedule?: unknown }[] }).categories.find((c) => c.id === catId);
    assert.deepEqual(snapCat?.schedule, VALID, "yedek zamanlamayı taşımıyor");
    await admin.from("menu_snapshots").delete().eq("id", snap.snapshotId);
    console.log("OK  menü yedeği zamanlamayı içeriyor (test yedeği silindi)");
  } finally {
    for (const [table, ids] of Object.entries(touched)) {
      await admin.from(table).update({ schedule: null }).in("id", ids);
    }
    console.log("Temizlik: dokunulan satırların schedule alanı null'a döndürüldü");
  }
}

main().catch((e) => {
  console.error("HATA:", e instanceof Error ? e.message : e);
  process.exit(1);
});
