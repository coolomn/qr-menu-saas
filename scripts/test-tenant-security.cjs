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
