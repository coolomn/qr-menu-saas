import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";
import {
  evaluateResolveLoginEmailRateLimit,
  type ResolveLoginEmailRateLimitDeps,
} from "./resolve-login-email";

function fakeLimiter(
  response: { success: boolean; limit: number; remaining: number; reset: number }
): RateLimiterLike {
  return {
    limit: async () => response,
  };
}

function makeDeps(
  overrides: Partial<ResolveLoginEmailRateLimitDeps>
): ResolveLoginEmailRateLimitDeps {
  return {
    getIpLimiter: () =>
      fakeLimiter({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60_000 }),
    getUsernameLimiter: () =>
      fakeLimiter({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60_000 }),
    checkLimit,
    ...overrides,
  };
}

describe("evaluateResolveLoginEmailRateLimit", () => {
  it("allows the request when neither limit is exceeded", async () => {
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", makeDeps({}));
    assert.deepEqual(result, { allowed: true });
  });

  it("returns limited when the IP limit is exceeded", async () => {
    const reset = Date.now() + 20_000;
    const deps = makeDeps({
      getIpLimiter: () => fakeLimiter({ success: false, limit: 10, remaining: 0, reset }),
    });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.ok(result.retryAfterSeconds >= 19 && result.retryAfterSeconds <= 20);
  });

  it("returns limited when the username limit is exceeded", async () => {
    const reset = Date.now() + 15_000;
    const deps = makeDeps({
      getUsernameLimiter: () => fakeLimiter({ success: false, limit: 5, remaining: 0, reset }),
    });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.ok(result.retryAfterSeconds >= 14 && result.retryAfterSeconds <= 15);
  });

  it("checks the IP limiter before the username limiter", async () => {
    const reset = Date.now() + 10_000;
    let usernameLimiterCalled = false;
    const deps = makeDeps({
      getIpLimiter: () => fakeLimiter({ success: false, limit: 10, remaining: 0, reset }),
      getUsernameLimiter: () => {
        usernameLimiterCalled = true;
        return fakeLimiter({ success: true, limit: 5, remaining: 4, reset: Date.now() + 60_000 });
      },
    });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.equal(result.allowed, false);
    assert.equal(usernameLimiterCalled, false);
  });

  it("fails open when the IP limiter is unavailable (missing Upstash env)", async () => {
    const deps = makeDeps({ getIpLimiter: () => null });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.deepEqual(result, { allowed: true });
  });

  it("fails open when the IP check throws (Upstash unreachable)", async () => {
    const deps = makeDeps({
      getIpLimiter: () => ({
        limit: async () => {
          throw new Error("upstash timeout");
        },
      }),
    });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.deepEqual(result, { allowed: true });
  });

  it("fails open when the username limiter is unavailable (missing Upstash env)", async () => {
    const deps = makeDeps({ getUsernameLimiter: () => null });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.deepEqual(result, { allowed: true });
  });

  it("fails open when the username check throws (Upstash unreachable)", async () => {
    const deps = makeDeps({
      getUsernameLimiter: () => ({
        limit: async () => {
          throw new Error("upstash timeout");
        },
      }),
    });
    const result = await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);

    assert.deepEqual(result, { allowed: true });
  });

  it("normalizes the username identifier (trims and lowercases) before checking the limiter", async () => {
    const seenIdentifiers: string[] = [];
    const trackingCheckLimit: typeof checkLimit = async (limiter, identifier) => {
      seenIdentifiers.push(identifier);
      return checkLimit(limiter, identifier);
    };
    const deps = makeDeps({ checkLimit: trackingCheckLimit });

    await evaluateResolveLoginEmailRateLimit("1.2.3.4", "  SomeUser  ", deps);

    assert.deepEqual(seenIdentifiers, ["1.2.3.4", "someuser"]);
  });

  it("logs a warning via console.warn when failing open", async () => {
    const warnSpy = mock.method(console, "warn", () => {});
    try {
      const deps = makeDeps({ getIpLimiter: () => null });
      await evaluateResolveLoginEmailRateLimit("1.2.3.4", "someuser", deps);
      assert.ok(warnSpy.mock.calls.length >= 1);
    } finally {
      warnSpy.mock.restore();
    }
  });
});
