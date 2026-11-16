/**
 * Faz 2.5c döviz uçtan uca testi — SADECE STAGING.
 * Kullanım: set -a; . ./.env.staging.local; set +a; node --import tsx scripts/test-currency-staging.ts <slug>
 * Akış: gerçek TCMB çekimi → exchange_rates → restorana döviz + sabit kur yaz → gerçek public yükleyici
 * kurları doğru döndürüyor mu → eski kur gizleniyor mu → restoranı eski haline döndür (kurlar kalır).
 */
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { refreshExchangeRates } from "../lib/currency/tcmb";
import { buildPublicMenuBootstrap, loadPublicMenuRestaurantBySlug } from "../lib/public-menu/load-public-menu";

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

async function main() {
  const refreshed = await refreshExchangeRates(admin);
  console.log("TCMB:", refreshed);
  assert.ok(refreshed.updated >= 8, "en az 8 döviz yazılmalı");

  const { data: before, error: readErr } = await admin
    .from("restaurants")
    .select("id, display_currencies, fixed_exchange_rates")
    .eq("slug", slug)
    .single();
  if (readErr) throw readErr;

  const { data: eurRow } = await admin.from("exchange_rates").select("*").eq("currency", "EUR").single();
  const { data: usdRow } = await admin.from("exchange_rates").select("*").eq("currency", "USD").single();
  try {
    // DB kısıtı: bilinmeyen döviz reddedilmeli.
    const bad = await admin.from("restaurants").update({ display_currencies: ["XXX"] }).eq("id", before.id);
    assert.ok(bad.error, "bilinmeyen döviz kabul edilmemeli");

    const upd = await admin
      .from("restaurants")
      .update({ display_currencies: ["GBP", "EUR", "RUB"], fixed_exchange_rates: { RUB: 0.6 } })
      .eq("id", before.id);
    if (upd.error) throw upd.error;

    const loaded = await loadPublicMenuRestaurantBySlug(admin, slug);
    assert.ok(loaded.ok);
    const boot = await buildPublicMenuBootstrap(admin, loaded.restaurant);
    const rates = boot.restaurant.currency_rates ?? [];
    console.log("currency_rates:", JSON.stringify(rates));
    assert.deepEqual(rates.map((r) => r.code), ["GBP", "EUR", "RUB"]);
    assert.equal(rates[1].try_per_unit, Number(eurRow.try_per_unit));
    assert.equal(rates[2].fixed, true);
    assert.equal(rates[2].try_per_unit, 0.6);
    assert.ok(!("display_currencies" in boot.restaurant), "ham kolon müşteriye gitmemeli");
    assert.ok(!("fixed_exchange_rates" in boot.restaurant), "ham kolon müşteriye gitmemeli");

    // 4 gün önce çekilmiş kur → gizlenir.
    const old = new Date(Date.now() - 4 * 86400_000).toISOString();
    await admin.from("exchange_rates").update({ fetched_at: old }).eq("currency", "USD");
    await admin.from("restaurants").update({ display_currencies: ["USD", "EUR"], fixed_exchange_rates: {} }).eq("id", before.id);
    const loaded2 = await loadPublicMenuRestaurantBySlug(admin, slug);
    assert.ok(loaded2.ok);
    const boot2 = await buildPublicMenuBootstrap(admin, loaded2.restaurant);
    assert.deepEqual((boot2.restaurant.currency_rates ?? []).map((r) => r.code), ["EUR"], "eski USD kuru gizlenmeli");
    console.log("OK: tüm kontroller geçti");
  } finally {
    await admin.from("exchange_rates").update({ fetched_at: usdRow.fetched_at }).eq("currency", "USD");
    await admin
      .from("restaurants")
      .update({ display_currencies: before.display_currencies, fixed_exchange_rates: before.fixed_exchange_rates })
      .eq("id", before.id);
    console.log("restoran eski haline döndü");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
