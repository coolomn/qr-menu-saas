/**
 * Menü önbellek temizleme uçtan uca testi: SADECE STAGING veritabanına bağlı önizleme (preview) üzerinde.
 * Kullanım:
 *   set -a; . ./.env.staging.local; set +a
 *   node --import tsx scripts/test-menu-cache-purge-preview.ts <preview-url> <slug> [bypass-secret]
 * Akış: menüyü iki kez oku (HIT bekle) → staging'de ürün fiyatını değiştir → sahibin oturumuyla
 * /api/menu/cache-refresh → menü hemen yeni fiyatı göstermeli → fiyatı geri al + tekrar yenile.
 */
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "nslzwigdblleanptchvs";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
if (!url.includes(STAGING_REF) || !serviceKey || !anonKey) {
  console.error("DURDURULDU: yalnızca staging ile çalışır.");
  process.exit(1);
}
const [previewUrl, slug, bypass] = process.argv.slice(2);
const PRODUCTION_HOSTS = new Set(["tapmenu.com.tr", "www.tapmenu.com.tr"]);
if (!previewUrl || !slug || PRODUCTION_HOSTS.has(new URL(previewUrl).hostname)) {
  console.error("preview-url (canlı değil) ve slug gerekli");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const extraHeaders: Record<string, string> = {};

/** Korumalı önizleme: "share:<token>" → paylaşım çerezi, aksi halde protection-bypass gizli anahtarı. */
async function setupAccess() {
  if (!bypass) return;
  if (bypass.startsWith("share:")) {
    const res = await fetch(`${previewUrl}/?_vercel_share=${bypass.slice(6)}`, { redirect: "manual" });
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    if (cookies.length === 0) throw new Error("paylaşım çerezi alınamadı");
    extraHeaders.Cookie = cookies.join("; ");
  } else {
    extraHeaders["x-vercel-protection-bypass"] = bypass;
  }
}

async function getMenu() {
  const res = await fetch(`${previewUrl}/api/public-menu/${slug}`, { headers: extraHeaders });
  const body = (await res.json()) as { products?: Array<{ id: string; price: number | string }> };
  return { status: res.status, cache: res.headers.get("x-vercel-cache"), body };
}

async function ownerToken(ownerId: string): Promise<string> {
  const { data: u, error } = await admin.auth.admin.getUserById(ownerId);
  if (error || !u.user?.email) throw error ?? new Error("sahip e-postası yok");
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (lErr) throw lErr;
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: s, error: vErr } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (vErr || !s.session) throw vErr ?? new Error("oturum yok");
  return s.session.access_token;
}

async function refresh(token: string) {
  const res = await fetch(`${previewUrl}/api/menu/cache-refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  await setupAccess();
  const { data: rest, error } = await admin.from("restaurants").select("id, owner_id").eq("slug", slug).single();
  if (error || !rest?.owner_id) throw error ?? new Error("restoranın sahibi yok (sahipli bir staging restoranı seçin)");

  const first = await getMenu();
  const second = await getMenu();
  console.log("1. okuma:", first.status, first.cache, "| 2. okuma:", second.status, second.cache);
  const product = second.body.products?.[0];
  if (!product) throw new Error("menüde ürün yok");

  const { data: row } = await admin.from("products").select("price").eq("id", product.id).single();
  const originalPrice = row!.price as number;
  const testPrice = Number(originalPrice) + 1;
  const token = await ownerToken(rest.owner_id as string);

  try {
    await admin.from("products").update({ price: testPrice }).eq("id", product.id);
    const before = await getMenu();
    const seenBefore = before.body.products?.find((p) => p.id === product.id)?.price;
    console.log("Fiyat değişti, yenilemeden önce:", before.cache, "fiyat", seenBefore, "(eski önbellek bekleniyor:", originalPrice, ")");

    console.log("cache-refresh:", await refresh(token));
    const after = await getMenu();
    const seenAfter = after.body.products?.find((p) => p.id === product.id)?.price;
    console.log("Yenilemeden sonra:", after.cache, "fiyat", seenAfter);
    const pass = Number(seenAfter) === testPrice;
    console.log(pass ? "SONUÇ: ANINDA GÜNCELLENDİ ✅" : "SONUÇ: GÜNCELLENMEDİ ❌");
    process.exitCode = pass ? 0 : 1;
  } finally {
    await admin.from("products").update({ price: originalPrice }).eq("id", product.id);
    await refresh(token);
    console.log("Fiyat geri alındı:", originalPrice);
  }

  const unauth = await fetch(`${previewUrl}/api/menu/cache-refresh`, { method: "POST", headers: extraHeaders });
  console.log("Oturumsuz cache-refresh:", unauth.status, "(401 bekleniyor)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
