import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RATE_LIMIT_CONFIG, envScopedPrefix, tryGetLimiter, type RateLimitName } from "./limiters";

const EXPECTED_NAMES: RateLimitName[] = [
  "resolveLoginEmailIp",
  "resolveLoginEmailUsername",
  "allergenSuggestShort",
  "allergenSuggestDaily",
  "menuImportAnalyze",
  "menuImportContinue",
  "masterAdminMutation",
  "masterAdminPasswordResetByAdmin",
  "masterAdminPasswordResetByRestaurant",
  "menuCacheRefresh",
];

describe("RATE_LIMIT_CONFIG", () => {
  it("defines exactly the approved Faz 1 limiter names", () => {
    assert.deepEqual(Object.keys(RATE_LIMIT_CONFIG).sort(), [...EXPECTED_NAMES].sort());
  });

  it("gives every prefix a unique Redis key namespace", () => {
    const prefixes = Object.values(RATE_LIMIT_CONFIG).map((config) => config.prefix);
    assert.equal(new Set(prefixes).size, prefixes.length);
  });

  it("matches the approved limit table for resolve-login-email", () => {
    assert.deepEqual(RATE_LIMIT_CONFIG.resolveLoginEmailIp, {
      algorithm: "slidingWindow",
      tokens: 10,
      window: "1 m",
      prefix: "ratelimit:resolve-login-email:ip",
    });
    assert.deepEqual(RATE_LIMIT_CONFIG.resolveLoginEmailUsername, {
      algorithm: "slidingWindow",
      tokens: 10,
      window: "1 m",
      prefix: "ratelimit:resolve-login-email:username",
    });
  });

  it("matches the approved limit table for allergen suggestion", () => {
    assert.deepEqual(RATE_LIMIT_CONFIG.allergenSuggestShort, {
      algorithm: "tokenBucket",
      refillRate: 20,
      interval: "1 m",
      maxTokens: 20,
      prefix: "ratelimit:allergen-suggest:short",
    });
    assert.deepEqual(RATE_LIMIT_CONFIG.allergenSuggestDaily, {
      algorithm: "fixedWindow",
      tokens: 200,
      window: "1 d",
      prefix: "ratelimit:allergen-suggest:daily",
    });
  });

  it("matches the approved limit table for menu import", () => {
    assert.deepEqual(RATE_LIMIT_CONFIG.menuImportAnalyze, {
      algorithm: "slidingWindow",
      tokens: 5,
      window: "1 h",
      prefix: "ratelimit:menu-import:analyze",
    });
    assert.deepEqual(RATE_LIMIT_CONFIG.menuImportContinue, {
      algorithm: "slidingWindow",
      tokens: 60,
      window: "1 m",
      prefix: "ratelimit:menu-import:continue",
    });
  });

  it("matches the approved limit table for master admin", () => {
    assert.deepEqual(RATE_LIMIT_CONFIG.masterAdminMutation, {
      algorithm: "tokenBucket",
      refillRate: 20,
      interval: "1 m",
      maxTokens: 20,
      prefix: "ratelimit:master-admin:mutation",
    });
    assert.deepEqual(RATE_LIMIT_CONFIG.masterAdminPasswordResetByAdmin, {
      algorithm: "slidingWindow",
      tokens: 5,
      window: "1 h",
      prefix: "ratelimit:master-admin:password-reset:admin",
    });
    assert.deepEqual(RATE_LIMIT_CONFIG.masterAdminPasswordResetByRestaurant, {
      algorithm: "slidingWindow",
      tokens: 3,
      window: "1 h",
      prefix: "ratelimit:master-admin:password-reset:restaurant",
    });
  });
});

describe("tryGetLimiter", () => {
  it("returns null for every limiter name when Upstash env vars are unset", () => {
    const keys = [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
    ] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];

    try {
      for (const name of EXPECTED_NAMES) {
        assert.equal(tryGetLimiter(name), null);
      }
    } finally {
      for (const k of keys) {
        if (saved[k] !== undefined) process.env[k] = saved[k];
      }
    }
  });
});

describe("envScopedPrefix", () => {
  it("keeps the prefix unchanged in production and when VERCEL_ENV is unset", () => {
    assert.equal(envScopedPrefix("ratelimit:x", "production"), "ratelimit:x");
    assert.equal(envScopedPrefix("ratelimit:x", undefined), "ratelimit:x");
  });

  it("namespaces preview keys so they never share counters with production", () => {
    assert.equal(envScopedPrefix("ratelimit:x", "preview"), "preview:ratelimit:x");
  });
});
