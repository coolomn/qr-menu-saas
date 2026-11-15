import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleLoginUsername,
  MAX_PASSWORD_LENGTH,
  SUPABASE_RATE_LIMIT_RETRY_SECONDS,
  type LoginUsernameDeps,
} from "./login-username-handler";
import type { ServerSignInConfig } from "./server-password-sign-in";

const config: ServerSignInConfig = {
  supabaseUrl: "https://example.supabase.co",
  apiKey: "sb_secret_x",
  forwardClientIp: true,
};

function makeDeps(overrides: Partial<LoginUsernameDeps> = {}) {
  const calls = { rateLimit: [] as string[][], resolve: [] as string[], signIn: [] as unknown[] };
  const deps: LoginUsernameDeps = {
    evaluateRateLimit: async (ip, username) => {
      calls.rateLimit.push([ip, username]);
      return { allowed: true };
    },
    getSignInConfig: () => config,
    resolveOwner: async (username) => {
      calls.resolve.push(username);
      return username === "cafe-one" ? { email: "owner@example.com", restaurantId: "r1" } : null;
    },
    signIn: async (cfg, credentials, ip) => {
      calls.signIn.push({ cfg, credentials, ip });
      return credentials.password === "right-pass"
        ? { ok: true, session: { access_token: "at", refresh_token: "rt" } }
        : { ok: false, reason: "invalid_credentials" };
    },
    ...overrides,
  };
  return { deps, calls };
}

describe("handleLoginUsername", () => {
  it("returns only tokens and restaurantId (never the email) on success", async () => {
    const { deps, calls } = makeDeps();
    const outcome = await handleLoginUsername(
      { username: "  Cafe-One ", password: "right-pass" },
      "203.0.113.9",
      deps
    );
    assert.deepEqual(outcome, { kind: "ok", access_token: "at", refresh_token: "rt", restaurantId: "r1" });
    assert.equal(JSON.stringify(outcome).includes("@"), false);
    assert.deepEqual(calls.rateLimit, [["203.0.113.9", "cafe-one"]]);
    assert.deepEqual(calls.signIn, [
      { cfg: config, credentials: { email: "owner@example.com", password: "right-pass" }, ip: "203.0.113.9" },
    ]);
  });

  it("gives the same invalid_credentials for unknown username and wrong password", async () => {
    const { deps } = makeDeps();
    const unknown = await handleLoginUsername({ username: "nobody", password: "x-pass" }, null, deps);
    const wrong = await handleLoginUsername({ username: "cafe-one", password: "wrong" }, null, deps);
    assert.deepEqual(unknown, { kind: "invalid_credentials" });
    assert.deepEqual(wrong, { kind: "invalid_credentials" });
  });

  it("rejects invalid bodies without touching rate limit, DB or Supabase", async () => {
    const { deps, calls } = makeDeps();
    for (const body of [
      null,
      "text",
      {},
      { username: "cafe-one" },
      { username: "cafe-one", password: "" },
      { username: "owner@example.com", password: "p" },
      { username: "ab", password: "p" },
      { username: "bad name!", password: "p" },
      { username: 42, password: "p" },
      { username: "cafe-one", password: "x".repeat(MAX_PASSWORD_LENGTH + 1) },
    ]) {
      assert.deepEqual(await handleLoginUsername(body, null, deps), { kind: "invalid_credentials" });
    }
    assert.equal(calls.rateLimit.length, 0);
    assert.equal(calls.resolve.length, 0);
    assert.equal(calls.signIn.length, 0);
  });

  it("stops with rate_limited before any lookup", async () => {
    const { deps, calls } = makeDeps({
      evaluateRateLimit: async () => ({ allowed: false, retryAfterSeconds: 300 }),
    });
    const outcome = await handleLoginUsername({ username: "cafe-one", password: "right-pass" }, null, deps);
    assert.deepEqual(outcome, { kind: "rate_limited", retryAfterSeconds: 300 });
    assert.equal(calls.resolve.length, 0);
    assert.equal(calls.signIn.length, 0);
  });

  it("uses 'unknown' as rate-limit IP when the client IP is missing", async () => {
    const { deps, calls } = makeDeps();
    await handleLoginUsername({ username: "cafe-one", password: "right-pass" }, null, deps);
    assert.deepEqual(calls.rateLimit, [["unknown", "cafe-one"]]);
  });

  it("maps a Supabase 429 to rate_limited", async () => {
    const { deps } = makeDeps({ signIn: async () => ({ ok: false, reason: "rate_limited" }) });
    assert.deepEqual(
      await handleLoginUsername({ username: "cafe-one", password: "right-pass" }, null, deps),
      { kind: "rate_limited", retryAfterSeconds: SUPABASE_RATE_LIMIT_RETRY_SECONDS }
    );
  });

  it("returns unavailable (not 'wrong password') on config, DB or Supabase outages", async () => {
    const body = { username: "cafe-one", password: "right-pass" };
    const cases: Partial<LoginUsernameDeps>[] = [
      { getSignInConfig: () => null },
      { resolveOwner: async () => "unavailable" },
      {
        resolveOwner: async () => {
          throw new Error("db down");
        },
      },
      { signIn: async () => ({ ok: false, reason: "unavailable" }) },
    ];
    for (const overrides of cases) {
      const { deps } = makeDeps(overrides);
      assert.deepEqual(await handleLoginUsername(body, null, deps), { kind: "unavailable" });
    }
  });

  it("reports a missing secret key but still signs in with the fallback config", async () => {
    let warned = 0;
    const { deps } = makeDeps({
      getSignInConfig: () => ({ ...config, apiKey: "eyJanon", forwardClientIp: false }),
      onMissingSecretKey: () => {
        warned += 1;
      },
    });
    const outcome = await handleLoginUsername({ username: "cafe-one", password: "right-pass" }, null, deps);
    assert.equal(outcome.kind, "ok");
    assert.equal(warned, 1);
  });
});
