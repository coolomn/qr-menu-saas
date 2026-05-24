/**
 * Staging anon RLS smoke test (local only).
 * Usage: node scripts/test-anon-rls.cjs
 *
 * Reads .env.staging.local via fs (no dotenv). Never prints secret values.
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.staging.local");
const TABLES = ["restaurants", "categories", "products"];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

async function probeTable(client, role, table) {
  const countRes = await client.from(table).select("id", { count: "exact", head: true });
  const sampleRes = await client.from(table).select("id").limit(3);

  const count = typeof countRes.count === "number" ? countRes.count : null;
  const sampleRows = Array.isArray(sampleRes.data) ? sampleRes.data.length : 0;
  const errorMessage = countRes.error?.message || sampleRes.error?.message || null;
  const errorCode = countRes.error?.code || sampleRes.error?.code || null;
  const blockedByRls =
    errorCode === "42501" ||
    /row-level security|permission denied/i.test(errorMessage || "");

  return {
    role,
    table,
    count,
    sampleRows,
    errorCode,
    errorMessage,
    blockedByRls,
    canReadRows: (count ?? 0) > 0 || sampleRows > 0,
  };
}

async function main() {
  const env = loadEnvFile(ENV_FILE);
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !anonKey) {
    console.error(
      "FAIL: NEXT_PUBLIC_SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_ANON_KEY eksik (.env.staging.local)."
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        envFile: ".env.staging.local",
        env: {
          hasUrl: !!url,
          hasAnon: !!anonKey,
          hasService: !!serviceKey,
        },
        purpose:
          "RLS sonrası anon doğrudan restaurants/categories/products okuyabiliyor mu?",
      },
      null,
      2
    )
  );

  const anon = createClient(url, anonKey);
  const anonResults = [];

  for (const table of TABLES) {
    anonResults.push(await probeTable(anon, "anon", table));
  }

  let serviceResults = null;
  if (serviceKey) {
    const service = createClient(url, serviceKey);
    serviceResults = [];
    for (const table of TABLES) {
      serviceResults.push(await probeTable(service, "service_role", table));
    }
  }

  const verdict = anonResults.map((r) => {
    const serviceRow = serviceResults?.find((s) => s.table === r.table);
    const serviceHasData =
      serviceRow && ((serviceRow.count ?? 0) > 0 || serviceRow.sampleRows > 0);

    let status;
    if (r.canReadRows) {
      status = "FAIL (anon veri görebiliyor)";
    } else if (r.blockedByRls) {
      status = "PASS (RLS engelledi)";
    } else if (serviceHasData) {
      status = "PASS (anon 0 satır, service veri var)";
    } else {
      status = "PASS (0 satır; tablo boş olabilir)";
    }

    return {
      table: r.table,
      anonCanReadRows: r.canReadRows,
      blockedByRls: r.blockedByRls,
      anonCount: r.count,
      anonSampleRows: r.sampleRows,
      serviceCount: serviceRow?.count ?? null,
      status,
    };
  });

  console.log(
    JSON.stringify(
      {
        anonResults,
        serviceResults,
        verdict,
      },
      null,
      2
    )
  );

  const anyLeak = verdict.some((v) => v.anonCanReadRows);
  process.exit(anyLeak ? 2 : 0);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
