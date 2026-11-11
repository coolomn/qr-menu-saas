/**
 * Menü yedeği uçtan uca testi — SADECE STAGING.
 * Kullanım: set -a; . ./.env.staging.local; set +a; node --import tsx scripts/test-menu-snapshot-staging.ts <slug>
 * Akış: yedek al → /api/menu/reset ile aynı silme → geri yükle → id'ler birebir aynı mı.
 */
import { createClient } from "@supabase/supabase-js";
import { createMenuSnapshot, restoreMenuSnapshot } from "../lib/menu-snapshot";

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

async function fingerprint(restaurantId: string) {
  const sel = async (table: string, col: string, val: string | string[], key: string) => {
    const q = admin.from(table).select(key);
    const { data, error } = await (Array.isArray(val) ? q.in(col, val) : q.eq(col, val)).limit(10000);
    if (error) throw error;
    return (data as unknown as Row[]).map((r) => key.split(",").map((k) => r[k]).join("|")).sort();
  };
  type Row = Record<string, string>;
  const cols = await sel("menu_collections", "restaurant_id", restaurantId, "id");
  return {
    categories: await sel("categories", "restaurant_id", restaurantId, "id"),
    products: await sel("products", "restaurant_id", restaurantId, "id"),
    variants: await sel("product_variants", "restaurant_id", restaurantId, "id"),
    collections: cols,
    catJunctions: cols.length ? await sel("category_menu_collections", "menu_collection_id", cols, "category_id,menu_collection_id") : [],
    prodJunctions: cols.length ? await sel("product_menu_collections", "menu_collection_id", cols, "product_id,menu_collection_id") : [],
  };
}

async function main() {
  const { data: rest, error } = await admin.from("restaurants").select("id").eq("slug", slug).single();
  if (error || !rest) throw error ?? new Error("restoran yok");
  const rid = rest.id as string;

  const before = await fingerprint(rid);
  console.log("ÖNCE:", Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.length])));

  const snap = await createMenuSnapshot(admin, rid, "e2e_test");
  if (!snap.ok || !snap.snapshotId) throw new Error("yedek alınamadı: " + JSON.stringify(snap));
  console.log("Yedek:", snap.snapshotId, snap.counts);

  // /api/menu/reset ile aynı silme
  const { error: pErr } = await admin.from("products").delete().in("category_id", before.categories);
  if (pErr) throw pErr;
  const { error: cErr } = await admin.from("categories").delete().eq("restaurant_id", rid);
  if (cErr) throw cErr;
  const wiped = await fingerprint(rid);
  console.log("SİLİNDİ:", Object.fromEntries(Object.entries(wiped).map(([k, v]) => [k, v.length])));

  const restored = await restoreMenuSnapshot(admin, snap.snapshotId, rid);
  if (!restored.ok) throw new Error("geri yükleme başarısız: " + JSON.stringify(restored));
  const after = await fingerprint(rid);
  console.log("SONRA:", Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v.length])));

  const same = JSON.stringify(before) === JSON.stringify(after);
  console.log(same ? "SONUÇ: BİREBİR AYNI ✅" : "SONUÇ: FARK VAR ❌");

  await admin.from("menu_snapshots").delete().eq("id", snap.snapshotId);
  process.exit(same ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
