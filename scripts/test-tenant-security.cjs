/**
 * Staging tenant-security smoke test (local only, STAGING ONLY).
 * Usage: node scripts/test-tenant-security.cjs
 *
 * Geçici bir owner + restoran + import job oluşturur, owner oturumuyla
 * yetkisiz değişiklikleri dener, sonuçları raporlar ve her şeyi siler.
 * .env.staging.local okunur; URL production ile aynıysa çalışmaz.
 * Secret değerleri asla yazdırılmaz.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, eq).trim()] = value;
  }
  return env;
}

const staging = loadEnvFile(path.join(ROOT, ".env.staging.local"));
const production = loadEnvFile(path.join(ROOT, ".env.production.local"));

const url = staging.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = staging.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = staging.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing staging env (.env.staging.local).");
  process.exit(2);
}
// Fail-closed: yalnızca bilinen staging projesine karşı çalışır.
const STAGING_PROJECT_REF = "nslzwigdblleanptchvs";
if (url !== `https://${STAGING_PROJECT_REF}.supabase.co`) {
  console.error(`REFUSING: URL is not the staging project (${STAGING_PROJECT_REF}).`);
  process.exit(2);
}
if (production.NEXT_PUBLIC_SUPABASE_URL === url) {
  console.error("REFUSING: staging URL equals production URL.");
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `tenant-sec-test-${suffix}@example.com`;
  const password = crypto.randomBytes(18).toString("base64url");
  let userId = null;
  let otherUserId = null;
  let restaurantId = null;
  let jobId = null;
  let otherRestaurantId = null;
  let ownCategoryId = null;
  let otherCategoryId = null;
  let hiddenProductId = null;
  const uploadedImagePaths = [];

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
    userId = created.user.id;

    const { data: other, error: otherErr } = await admin.auth.admin.createUser({
      email: `tenant-sec-other-${suffix}@example.com`,
      password: crypto.randomBytes(18).toString("base64url"),
      email_confirm: true,
    });
    if (otherErr) throw new Error(`createUser other: ${otherErr.message}`);
    otherUserId = other.user.id;

    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const { data: rest, error: restErr } = await admin
      .from("restaurants")
      .insert({
        name: `Tenant Sec Test ${suffix}`,
        slug: `tenant-sec-test-${suffix}`,
        owner_id: userId,
        tenant_status: "expired",
        subscription_ends_at: pastDate,
      })
      .select("id")
      .single();
    if (restErr) throw new Error(`insert restaurant: ${restErr.message}`);
    restaurantId = rest.id;

    const { data: job, error: jobErr } = await admin
      .from("menu_import_jobs")
      .insert({
        restaurant_id: restaurantId,
        user_id: userId,
        status: "failed",
        storage_path: `restaurants/${restaurantId}/imports/${userId}/test.pdf`,
      })
      .select("id")
      .single();
    if (jobErr) {
      // Kurulum başarısızsa import job kontrolleri sessizce atlanmasın: FAIL say.
      record("seed import job for tamper checks", false, jobErr.message);
    } else {
      jobId = job.id;
    }

    // Başka bir tenant (otherUser) + kategoriler + pasif ürün
    {
      const { data: otherRest, error } = await admin
        .from("restaurants")
        .insert({ name: `Tenant Sec Other ${suffix}`, slug: `tenant-sec-other-${suffix}`, owner_id: otherUserId })
        .select("id")
        .single();
      if (error) throw new Error(`insert other restaurant: ${error.message}`);
      otherRestaurantId = otherRest.id;

      const { data: cats, error: catErr } = await admin
        .from("categories")
        .insert([
          { name: `Own Cat ${suffix}`, restaurant_id: restaurantId },
          { name: `Other Cat ${suffix}`, restaurant_id: otherRestaurantId },
        ])
        .select("id, restaurant_id");
      if (catErr) throw new Error(`insert categories: ${catErr.message}`);
      ownCategoryId = cats.find((c) => c.restaurant_id === restaurantId).id;
      otherCategoryId = cats.find((c) => c.restaurant_id === otherRestaurantId).id;

      const { data: prod, error: prodErr } = await admin
        .from("products")
        .insert({
          name: `Hidden ${suffix}`,
          price: "1",
          restaurant_id: restaurantId,
          category_id: ownCategoryId,
          is_active: false,
        })
        .select("id")
        .single();
      if (prodErr) throw new Error(`insert product: ${prodErr.message}`);
      hiddenProductId = prod.id;
    }

    // 7) Giriş yapmamış ziyaretçi (anon key) tenant verisini okuyamamalı
    {
      const anon = createClient(url, anonKey, { auth: { persistSession: false } });
      const { data: r } = await anon
        .from("restaurants")
        .select("id, login_username, owner_id, tenant_status")
        .in("id", [restaurantId, otherRestaurantId]);
      record("anon cannot read restaurants (login_username/owner_id)", !r || r.length === 0, `${r ? r.length : 0} rows`);

      const { data: c } = await anon.from("categories").select("id").in("id", [ownCategoryId, otherCategoryId]);
      record("anon cannot read categories", !c || c.length === 0, `${c ? c.length : 0} rows`);

      const { data: p } = await anon.from("products").select("id").eq("id", hiddenProductId);
      record("anon cannot read products (incl. inactive)", !p || p.length === 0, `${p ? p.length : 0} rows`);

      // Eski production bucket'ı: menu-images (yalnızca varsa test edilir)
      const { data: bucket } = await admin.storage.getBucket("menu-images");
      if (!bucket) {
        record("anon cannot upload to menu-images", true, "bucket yok, kontrol uygulanamadı");
      } else {
        const p = `tenant-sec-test-${suffix}.txt`;
        const { error } = await anon.storage
          .from("menu-images")
          .upload(p, Buffer.from("x"), { contentType: "text/plain" });
        if (!error) uploadedImagePaths.push(p);
        record("anon cannot upload to menu-images", !!error, error ? "rejected" : "UPLOADED");
      }
    }

    const owner = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signErr } = await owner.auth.signInWithPassword({ email, password });
    if (signErr) throw new Error(`signIn: ${signErr.message}`);

    // 1) Owner aboneliğini yeniden açamamalı
    {
      const { error } = await owner
        .from("restaurants")
        .update({ tenant_status: "active", subscription_ends_at: null })
        .eq("id", restaurantId);
      const { data: after } = await admin
        .from("restaurants")
        .select("tenant_status, subscription_ends_at")
        .eq("id", restaurantId)
        .single();
      record(
        "owner cannot reactivate subscription",
        after.tenant_status === "expired" && after.subscription_ends_at !== null,
        error ? `rejected: ${error.code}` : "no error returned"
      );
    }

    // 2) Owner slug ve restoran adını değiştirememeli (owner_id zaten RLS WITH CHECK ile korunuyor;
    //    burada yalnızca tetikleyicinin koruduğu alanlar test edilir)
    {
      const { error: slugErr } = await owner
        .from("restaurants")
        .update({ slug: `hijack-${suffix}` })
        .eq("id", restaurantId);
      const { error: nameErr } = await owner
        .from("restaurants")
        .update({ name: `Hijacked ${suffix}` })
        .eq("id", restaurantId);
      const { data: after } = await admin
        .from("restaurants")
        .select("slug, name")
        .eq("id", restaurantId)
        .single();
      record(
        "owner cannot change slug",
        after.slug === `tenant-sec-test-${suffix}`,
        slugErr ? `rejected: ${slugErr.code}` : "no error returned"
      );
      record(
        "owner cannot change name",
        after.name === `Tenant Sec Test ${suffix}`,
        nameErr ? `rejected: ${nameErr.code}` : "no error returned"
      );
    }

    // 3) Owner görünüm ayarlarını hâlâ kaydedebilmeli (regresyon)
    {
      const { error } = await owner
        .from("restaurants")
        .update({ primary_color: "#123456", instagram: "test_account" })
        .eq("id", restaurantId);
      const { data: after } = await admin
        .from("restaurants")
        .select("primary_color, instagram")
        .eq("id", restaurantId)
        .single();
      record(
        "owner CAN still save appearance settings",
        !error && after.primary_color === "#123456" && after.instagram === "test_account",
        error ? error.message : ""
      );
    }

    // 4) Owner yeni restoran açamamalı
    {
      const { data, error } = await owner
        .from("restaurants")
        .insert({ name: "x", slug: `free-${suffix}`, owner_id: userId })
        .select("id");
      const inserted = Array.isArray(data) && data.length > 0;
      if (inserted) {
        await admin.from("restaurants").delete().eq("id", data[0].id);
      }
      record("owner cannot insert restaurant", !inserted, error ? `rejected: ${error.code}` : "");
    }

    // 5) Owner import job storage_path değiştirememeli
    if (jobId) {
      const evilPath = `restaurants/${crypto.randomUUID()}/imports/${otherUserId}/secret.pdf`;
      await owner
        .from("menu_import_jobs")
        .update({ storage_path: evilPath, status: "pending" })
        .eq("id", jobId);
      const { data: after } = await admin
        .from("menu_import_jobs")
        .select("storage_path, status")
        .eq("id", jobId)
        .single();
      record(
        "owner cannot modify import job",
        after.storage_path !== evilPath && after.status === "failed"
      );

      const { data: ins } = await owner
        .from("menu_import_jobs")
        .insert({ restaurant_id: restaurantId, user_id: userId, status: "pending", storage_path: evilPath })
        .select("id");
      const jobInserted = Array.isArray(ins) && ins.length > 0;
      if (jobInserted) await admin.from("menu_import_jobs").delete().eq("id", ins[0].id);
      record("owner cannot insert import job", !jobInserted);
    }

    // 8) Owner kendi kategorisiyle başka restoranın menüsüne ürün yazamamalı
    {
      const { data } = await owner
        .from("products")
        .insert({ name: `Injected ${suffix}`, price: "1", restaurant_id: otherRestaurantId, category_id: ownCategoryId })
        .select("id");
      const inserted = Array.isArray(data) && data.length > 0;
      if (inserted) await admin.from("products").delete().eq("id", data[0].id);
      record("owner cannot insert product into another restaurant", !inserted);
    }

    // 9) Owner restoranını silememeli
    {
      await owner.from("restaurants").delete().eq("id", restaurantId);
      const { data: still } = await admin.from("restaurants").select("id").eq("id", restaurantId);
      record("owner cannot delete restaurant", Array.isArray(still) && still.length === 1);
    }

    // 10) Owner kendi kategori/ürünlerini görebilmeli, başkasınınkini görememeli (regresyon)
    {
      const { data: cats } = await owner.from("categories").select("id").in("id", [ownCategoryId, otherCategoryId]);
      const ids = (cats || []).map((c) => c.id);
      record(
        "owner sees own categories only",
        ids.length === 1 && ids[0] === ownCategoryId,
        `${ids.length} rows`
      );
      const { data: prods } = await owner.from("products").select("id").eq("id", hiddenProductId);
      record("owner CAN read own products (incl. inactive)", Array.isArray(prods) && prods.length === 1);
    }

    // 6) Service role (master admin API yolu) hâlâ abonelik güncelleyebilmeli
    {
      const { error } = await admin
        .from("restaurants")
        .update({ tenant_status: "active" })
        .eq("id", restaurantId);
      record("service role CAN update tenant_status", !error, error ? error.message : "");
    }
  } finally {
    if (jobId) await admin.from("menu_import_jobs").delete().eq("id", jobId);
    if (uploadedImagePaths.length) await admin.storage.from("menu-images").remove(uploadedImagePaths);
    for (const rid of [restaurantId, otherRestaurantId].filter(Boolean)) {
      await admin.from("products").delete().eq("restaurant_id", rid);
      await admin.from("categories").delete().eq("restaurant_id", rid);
    }
    if (otherRestaurantId) await admin.from("restaurants").delete().eq("id", otherRestaurantId);
    if (restaurantId) await admin.from("restaurants").delete().eq("id", restaurantId);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (otherUserId) await admin.auth.admin.deleteUser(otherUserId);
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(2);
});
