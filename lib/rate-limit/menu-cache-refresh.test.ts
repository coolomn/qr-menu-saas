import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";
import { evaluateMenuCacheRefreshRateLimit } from "./menu-cache-refresh";

function limiter(success: boolean): RateLimiterLike {
  return { limit: async () => ({ success, limit: 30, remaining: success ? 29 : 0, reset: Date.now() + 30_000 }) };
}

describe("evaluateMenuCacheRefreshRateLimit", () => {
  it("allows under the limit", async () => {
    const d = await evaluateMenuCacheRefreshRateLimit("u1", { getLimiter: () => limiter(true), checkLimit });
    assert.deepEqual(d, { allowed: true });
  });

  it("blocks over the limit with retry-after", async () => {
    const d = await evaluateMenuCacheRefreshRateLimit("u1", { getLimiter: () => limiter(false), checkLimit });
    assert.equal(d.allowed, false);
    assert.ok(!d.allowed && d.retryAfterSeconds > 0);
  });

  it("fails open when Redis is not configured", async () => {
    const d = await evaluateMenuCacheRefreshRateLimit("u1", { getLimiter: () => null, checkLimit });
    assert.deepEqual(d, { allowed: true });
  });

  it("fails open when Redis errors", async () => {
    const broken: RateLimiterLike = { limit: async () => { throw new Error("down"); } };
    const d = await evaluateMenuCacheRefreshRateLimit("u1", { getLimiter: () => broken, checkLimit });
    assert.deepEqual(d, { allowed: true });
  });
});
