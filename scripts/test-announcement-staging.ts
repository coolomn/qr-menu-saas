/**
 * Faz 2.9 duyuru şeridi uçtan uca testi — SADECE STAGING.
 * Kullanım: set -a; . ./.env.staging.local; set +a; node --import tsx scripts/test-announcement-staging.ts <slug> [--keep]
 * Akış: restorana duyuru yaz → gerçek public yükleyici doğru yük döndürüyor mu → kapalı/boş/geçersiz
 * durumlarda alan yok mu → (--keep yoksa) restoranı eski haline döndür.
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { buildPublicMenuBootstrap, loadPublicMenuRestaurantBySlug } from "../lib/public-menu/load-public-menu";

const STAGING_REF = "nslzwigdblleanptchvs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url.includes(STAGING_REF) || !key) {
  console.error("DURDURULDU: yalnızca staging ile çalışır.");
  process.exit(1);
}
const slug = process.argv[2];
const keep = process.argv.includes("--keep");
if (!slug) {
  console.error("slug gerekli");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

async function bootstrap() {
  const loaded = await loadPublicMenuRestaurantBySlug(admin, slug);
  assert.ok(loaded.ok);
  return buildPublicMenuBootstrap(admin, loaded.restaurant);
}

async function main() {
  const { data: before, error } = await admin.from("restaurants").select("id, announcement").eq("slug", slug).single();
  if (error) throw error;

  try {
    const set = async (announcement: unknown) => {
      const r = await admin.from("restaurants").update({ announcement }).eq("id", before.id);
      if (r.error) throw r.error;
    };

    await set({});
    assert.ok(!("announcement" in (await bootstrap()).restaurant), "duyuru yokken alan olmamalı");

    await set({ enabled: false, text: "Kapalı duyuru" });
    assert.ok(!("announcement" in (await bootstrap()).restaurant), "kapalı duyuru müşteriye gitmemeli");

    await set({ enabled: true, text: "   " });
    assert.ok(!("announcement" in (await bootstrap()).restaurant), "boş metinli duyuru gitmemeli");

    const live = {
      enabled: true,
      text: "Cuma akşamı canlı müzik var!",
      translations: { en: { text: "Live music on Friday night!" }, de: { text: "Freitagabend Livemusik!" } },
      starts_on: "2026-01-01",
      ends_on: "2099-12-31",
    };
    await set(live);
    const boot = await bootstrap();
    console.log("announcement:", JSON.stringify(boot.restaurant.announcement));
    assert.deepEqual(boot.restaurant.announcement, live);

    const bad = await admin.from("restaurants").update({ announcement: { enabled: true, text: "x", evil: 1 } }).eq("id", before.id);
    assert.ok(bad.error, "bilinmeyen anahtar DB'de reddedilmeli");

    console.log("OK: tüm kontroller geçti");
    if (keep) {
      console.log("--keep: test duyurusu staging'de bırakıldı (önizleme kontrolü için)");
      return;
    }
  } finally {
    if (!keep) {
      await admin.from("restaurants").update({ announcement: before.announcement }).eq("id", before.id);
      console.log("restoran eski haline döndü");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
