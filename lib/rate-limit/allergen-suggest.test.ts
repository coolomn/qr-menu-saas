import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";
import {
  evaluateAllergenSuggestRateLimit,
  type AllergenSuggestRateLimitDeps,
} from "./allergen-suggest";

function fakeLimiter(
  response: { success: boolean; limit: number; remaining: number; reset: number }
): RateLimiterLike {
  return {
    limit: async () => response,
  };
}

function makeDeps(overrides: Partial<AllergenSuggestRateLimitDeps>): AllergenSuggestRateLimitDeps {
  return {
    getDailyLimiter: () =>
      fakeLimiter({ success: true, limit: 200, remaining: 199, reset: Date.now() + 86_400_000 }),
    getShortLimiter: () =>
      fakeLimiter({ success: true, limit: 20, remaining: 19, reset: Date.now() + 60_000 }),
    checkLimit,
    ...overrides,
  };
}

describe("evaluateAllergenSuggestRateLimit", () => {
  it("allows the request when both limiters report success", async () => {
    const result = await evaluateAllergenSuggestRateLimit("user-1", makeDeps({}));
    assert.deepEqual(result, { allowed: true });
  });

  it("returns limited when the short window is exceeded", async () => {
    const reset = Date.now() + 15_000;
    const deps = makeDeps({
      getShortLimiter: () => fakeLimiter({ success: false, limit: 20, remaining: 0, reset }),
    });
    const result = await evaluateAllergenSuggestRateLimit("user-2", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.kind, "limited");
    if (result.kind !== "limited") return;
    assert.ok(result.retryAfterSeconds >= 14 && result.retryAfterSeconds <= 15);
  });

  it("returns limited when the short window is exceeded, without consuming the daily cap", async () => {
    const reset = Date.now() + 30_000;
    let dailyLimiterCalled = false;
    const deps = makeDeps({
      getShortLimiter: () => fakeLimiter({ success: false, limit: 20, remaining: 0, reset }),
      getDailyLimiter: () => {
        dailyLimiterCalled = true;
        return fakeLimiter({ success: true, limit: 200, remaining: 199, reset: Date.now() + 86_400_000 });
      },
    });
    const result = await evaluateAllergenSuggestRateLimit("user-3", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.kind, "limited");
    assert.equal(dailyLimiterCalled, false);
  });

  it("returns limited when the daily cap is exceeded", async () => {
    const reset = Date.now() + 3_600_000;
    const deps = makeDeps({
      getDailyLimiter: () => fakeLimiter({ success: false, limit: 200, remaining: 0, reset }),
    });
    const result = await evaluateAllergenSuggestRateLimit("user-3b", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.kind, "limited");
  });

  it("fails closed as unavailable when the daily limiter throws (Upstash unreachable)", async () => {
    const deps = makeDeps({
      getDailyLimiter: () => ({
        limit: async () => {
          throw new Error("upstash timeout");
        },
      }),
    });
    const result = await evaluateAllergenSuggestRateLimit("user-4", deps);

    assert.deepEqual(result, { allowed: false, kind: "unavailable" });
  });

  it("fails closed as unavailable when no limiter is configured (missing Upstash env)", async () => {
    const deps = makeDeps({ getDailyLimiter: () => null });
    const result = await evaluateAllergenSuggestRateLimit("user-5", deps);

    assert.deepEqual(result, { allowed: false, kind: "unavailable" });
  });

  it("derives retryAfterSeconds from the limiter's reset timestamp", async () => {
    const reset = Date.now() + 42_000;
    const deps = makeDeps({
      getShortLimiter: () => fakeLimiter({ success: false, limit: 20, remaining: 0, reset }),
    });
    const result = await evaluateAllergenSuggestRateLimit("user-6", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.kind, "limited");
    if (result.kind !== "limited") return;
    assert.ok(result.retryAfterSeconds >= 41 && result.retryAfterSeconds <= 42);
  });
});
