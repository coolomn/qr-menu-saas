import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";
import { evaluateOwnerLoginRateLimit, type OwnerLoginRateLimitDeps } from "./owner-login";

function fakeLimiter(
  response: { success: boolean; limit: number; remaining: number; reset: number }
): RateLimiterLike {
  return { limit: async () => response };
}

const ok = () => fakeLimiter({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60_000 });
const limited = (reset: number) => fakeLimiter({ success: false, limit: 10, remaining: 0, reset });
const throwing = (): RateLimiterLike => ({
  limit: async () => {
    throw new Error("upstash timeout");
  },
});

function makeDeps(overrides: Partial<OwnerLoginRateLimitDeps>): OwnerLoginRateLimitDeps {
  return {
    getIpLimiter: ok,
    getIpUsernameLimiter: ok,
    getUsernameLimiter: ok,
    checkLimit,
    ...overrides,
  };
}

describe("evaluateOwnerLoginRateLimit", () => {
  it("allows the request when no limit is exceeded", async () => {
    const result = await evaluateOwnerLoginRateLimit("1.2.3.4", "someuser", makeDeps({}));
    assert.deepEqual(result, { allowed: true });
  });

  for (const key of ["getIpLimiter", "getIpUsernameLimiter", "getUsernameLimiter"] as const) {
    it(`returns limited with Retry-After when ${key} is exceeded`, async () => {
      const reset = Date.now() + 20_000;
      const deps = makeDeps({ [key]: () => limited(reset) });
      const result = await evaluateOwnerLoginRateLimit("1.2.3.4", "someuser", deps);
      assert.equal(result.allowed, false);
      if (result.allowed) return;
      assert.ok(result.retryAfterSeconds >= 19 && result.retryAfterSeconds <= 20);
    });

    it(`fails open when ${key} is missing or throws`, async () => {
      assert.deepEqual(
        await evaluateOwnerLoginRateLimit("1.2.3.4", "someuser", makeDeps({ [key]: () => null })),
        { allowed: true }
      );
      assert.deepEqual(
        await evaluateOwnerLoginRateLimit("1.2.3.4", "someuser", makeDeps({ [key]: throwing })),
        { allowed: true }
      );
    });
  }

  it("stops at the first exceeded limit (IP before the others)", async () => {
    let laterCalled = false;
    const deps = makeDeps({
      getIpLimiter: () => limited(Date.now() + 10_000),
      getIpUsernameLimiter: () => {
        laterCalled = true;
        return ok();
      },
    });
    const result = await evaluateOwnerLoginRateLimit("1.2.3.4", "someuser", deps);
    assert.equal(result.allowed, false);
    assert.equal(laterCalled, false);
  });

  it("uses ip, ip|username and normalized username as identifiers", async () => {
    const seen: string[] = [];
    const trackingCheckLimit: typeof checkLimit = async (limiter, identifier) => {
      seen.push(identifier);
      return checkLimit(limiter, identifier);
    };
    await evaluateOwnerLoginRateLimit("1.2.3.4", "  SomeUser  ", makeDeps({ checkLimit: trackingCheckLimit }));
    assert.deepEqual(seen, ["1.2.3.4", "1.2.3.4|someuser", "someuser"]);
  });

  it("logs a warning when failing open", async () => {
    const warnSpy = mock.method(console, "warn", () => {});
    try {
      await evaluateOwnerLoginRateLimit("1.2.3.4", "someuser", makeDeps({ getIpLimiter: () => null }));
      assert.ok(warnSpy.mock.calls.length >= 1);
    } finally {
      warnSpy.mock.restore();
    }
  });
});
