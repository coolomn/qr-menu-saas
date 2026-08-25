import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";
import {
  evaluateMenuImportAnalyzeRateLimit,
  evaluateMenuImportContinueRateLimit,
  type MenuImportRateLimitDeps,
} from "./menu-import";

function fakeLimiter(
  response: { success: boolean; limit: number; remaining: number; reset: number }
): RateLimiterLike {
  return {
    limit: async () => response,
  };
}

function makeDeps(overrides: Partial<MenuImportRateLimitDeps>): MenuImportRateLimitDeps {
  return {
    getLimiter: () =>
      fakeLimiter({ success: true, limit: 5, remaining: 4, reset: Date.now() + 3_600_000 }),
    checkLimit,
    ...overrides,
  };
}

describe("evaluateMenuImportAnalyzeRateLimit", () => {
  it("allows the request when under the limit", async () => {
    const result = await evaluateMenuImportAnalyzeRateLimit("user-1", "rest-1", makeDeps({}));
    assert.deepEqual(result, { allowed: true });
  });

  it("returns limited with a correct retryAfterSeconds when the limit is exceeded", async () => {
    const reset = Date.now() + 1_800_000;
    const deps = makeDeps({
      getLimiter: () => fakeLimiter({ success: false, limit: 5, remaining: 0, reset }),
    });
    const result = await evaluateMenuImportAnalyzeRateLimit("user-2", "rest-2", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.kind, "limited");
    if (result.kind !== "limited") return;
    const expected = Math.ceil((reset - Date.now()) / 1000);
    assert.ok(Math.abs(result.retryAfterSeconds - expected) <= 1);
  });

  it("fails closed as unavailable when no limiter is configured (missing Upstash env)", async () => {
    const deps = makeDeps({ getLimiter: () => null });
    const result = await evaluateMenuImportAnalyzeRateLimit("user-3", "rest-3", deps);

    assert.deepEqual(result, { allowed: false, kind: "unavailable" });
  });

  it("fails closed as unavailable when the limiter throws (Upstash unreachable)", async () => {
    const deps = makeDeps({
      getLimiter: () => ({
        limit: async () => {
          throw new Error("upstash timeout");
        },
      }),
    });
    const result = await evaluateMenuImportAnalyzeRateLimit("user-4", "rest-4", deps);

    assert.deepEqual(result, { allowed: false, kind: "unavailable" });
  });

  it("keys the limiter identifier on user+restaurant so per-restaurant limits don't cross-pollute", async () => {
    const seenIdentifiers: string[] = [];
    const trackingCheckLimit: typeof checkLimit = async (limiter, identifier) => {
      seenIdentifiers.push(identifier);
      return checkLimit(limiter, identifier);
    };
    const deps = makeDeps({ checkLimit: trackingCheckLimit });

    await evaluateMenuImportAnalyzeRateLimit("user-5", "rest-5", deps);

    assert.deepEqual(seenIdentifiers, ["user-5:rest-5"]);
  });
});

describe("evaluateMenuImportContinueRateLimit", () => {
  it("allows the request when under the limit", async () => {
    const deps = makeDeps({
      getLimiter: () =>
        fakeLimiter({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60_000 }),
    });
    const result = await evaluateMenuImportContinueRateLimit("user-1", deps);
    assert.deepEqual(result, { allowed: true });
  });

  it("returns limited with a correct retryAfterSeconds when the limit is exceeded", async () => {
    const reset = Date.now() + 20_000;
    const deps = makeDeps({
      getLimiter: () => fakeLimiter({ success: false, limit: 60, remaining: 0, reset }),
    });
    const result = await evaluateMenuImportContinueRateLimit("user-2", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.kind, "limited");
    if (result.kind !== "limited") return;
    const expected = Math.ceil((reset - Date.now()) / 1000);
    assert.ok(Math.abs(result.retryAfterSeconds - expected) <= 1);
  });

  it("fails closed as unavailable when no limiter is configured (missing Upstash env)", async () => {
    const deps = makeDeps({ getLimiter: () => null });
    const result = await evaluateMenuImportContinueRateLimit("user-3", deps);

    assert.deepEqual(result, { allowed: false, kind: "unavailable" });
  });

  it("fails closed as unavailable when the limiter throws (Upstash unreachable)", async () => {
    const deps = makeDeps({
      getLimiter: () => ({
        limit: async () => {
          throw new Error("upstash timeout");
        },
      }),
    });
    const result = await evaluateMenuImportContinueRateLimit("user-4", deps);

    assert.deepEqual(result, { allowed: false, kind: "unavailable" });
  });
});
