import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";
import {
  evaluateMasterAdminMutationRateLimit,
  evaluateMasterAdminPasswordResetRateLimit,
  type MasterAdminMutationRateLimitDeps,
  type MasterAdminPasswordResetRateLimitDeps,
} from "./master-admin";

function fakeLimiter(
  response: { success: boolean; limit: number; remaining: number; reset: number }
): RateLimiterLike {
  return {
    limit: async () => response,
  };
}

function makeMutationDeps(
  overrides: Partial<MasterAdminMutationRateLimitDeps>
): MasterAdminMutationRateLimitDeps {
  return {
    getLimiter: () =>
      fakeLimiter({ success: true, limit: 20, remaining: 19, reset: Date.now() + 60_000 }),
    checkLimit,
    ...overrides,
  };
}

function makePasswordResetDeps(
  overrides: Partial<MasterAdminPasswordResetRateLimitDeps>
): MasterAdminPasswordResetRateLimitDeps {
  return {
    getAdminLimiter: () =>
      fakeLimiter({ success: true, limit: 5, remaining: 4, reset: Date.now() + 3_600_000 }),
    getRestaurantLimiter: () =>
      fakeLimiter({ success: true, limit: 3, remaining: 2, reset: Date.now() + 3_600_000 }),
    checkLimit,
    ...overrides,
  };
}

describe("evaluateMasterAdminMutationRateLimit", () => {
  it("allows the request when under the limit", async () => {
    const result = await evaluateMasterAdminMutationRateLimit("admin-1", makeMutationDeps({}));
    assert.deepEqual(result, { allowed: true });
  });

  it("returns limited with a correct retryAfterSeconds when the limit is exceeded", async () => {
    const reset = Date.now() + 10_000;
    const deps = makeMutationDeps({
      getLimiter: () => fakeLimiter({ success: false, limit: 20, remaining: 0, reset }),
    });
    const result = await evaluateMasterAdminMutationRateLimit("admin-2", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.ok(result.retryAfterSeconds >= 9 && result.retryAfterSeconds <= 10);
  });

  it("fails open when no limiter is configured (missing Upstash env)", async () => {
    const warnSpy = mock.method(console, "warn", () => {});
    try {
      const deps = makeMutationDeps({ getLimiter: () => null });
      const result = await evaluateMasterAdminMutationRateLimit("admin-3", deps);

      assert.deepEqual(result, { allowed: true });
      assert.ok(warnSpy.mock.calls.length >= 1);
    } finally {
      warnSpy.mock.restore();
    }
  });

  it("fails open when the limiter throws (Upstash unreachable)", async () => {
    const warnSpy = mock.method(console, "warn", () => {});
    try {
      const deps = makeMutationDeps({
        getLimiter: () => ({
          limit: async () => {
            throw new Error("upstash timeout");
          },
        }),
      });
      const result = await evaluateMasterAdminMutationRateLimit("admin-4", deps);

      assert.deepEqual(result, { allowed: true });
      assert.ok(warnSpy.mock.calls.length >= 1);
    } finally {
      warnSpy.mock.restore();
    }
  });
});

describe("evaluateMasterAdminPasswordResetRateLimit", () => {
  it("allows the request when neither limit is exceeded", async () => {
    const result = await evaluateMasterAdminPasswordResetRateLimit(
      "admin-1",
      "rest-1",
      makePasswordResetDeps({})
    );
    assert.deepEqual(result, { allowed: true });
  });

  it("returns limited when the admin key is exceeded", async () => {
    const reset = Date.now() + 1_800_000;
    const deps = makePasswordResetDeps({
      getAdminLimiter: () => fakeLimiter({ success: false, limit: 5, remaining: 0, reset }),
    });
    const result = await evaluateMasterAdminPasswordResetRateLimit("admin-2", "rest-2", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    const expected = Math.ceil((reset - Date.now()) / 1000);
    assert.ok(Math.abs(result.retryAfterSeconds - expected) <= 1);
  });

  it("returns limited when the restaurant key is exceeded", async () => {
    const reset = Date.now() + 900_000;
    const deps = makePasswordResetDeps({
      getRestaurantLimiter: () => fakeLimiter({ success: false, limit: 3, remaining: 0, reset }),
    });
    const result = await evaluateMasterAdminPasswordResetRateLimit("admin-3", "rest-3", deps);

    assert.equal(result.allowed, false);
    if (result.allowed) return;
    const expected = Math.ceil((reset - Date.now()) / 1000);
    assert.ok(Math.abs(result.retryAfterSeconds - expected) <= 1);
  });

  it("checks the admin key before the restaurant key", async () => {
    const reset = Date.now() + 60_000;
    let restaurantLimiterCalled = false;
    const deps = makePasswordResetDeps({
      getAdminLimiter: () => fakeLimiter({ success: false, limit: 5, remaining: 0, reset }),
      getRestaurantLimiter: () => {
        restaurantLimiterCalled = true;
        return fakeLimiter({ success: true, limit: 3, remaining: 2, reset: Date.now() + 3_600_000 });
      },
    });
    const result = await evaluateMasterAdminPasswordResetRateLimit("admin-4", "rest-4", deps);

    assert.equal(result.allowed, false);
    assert.equal(restaurantLimiterCalled, false);
  });

  it("fails open when the admin limiter is unavailable (missing Upstash env)", async () => {
    const warnSpy = mock.method(console, "warn", () => {});
    try {
      const deps = makePasswordResetDeps({ getAdminLimiter: () => null });
      const result = await evaluateMasterAdminPasswordResetRateLimit("admin-5", "rest-5", deps);

      assert.deepEqual(result, { allowed: true });
      assert.ok(warnSpy.mock.calls.length >= 1);
    } finally {
      warnSpy.mock.restore();
    }
  });

  it("fails open when the restaurant check throws (Upstash unreachable)", async () => {
    const warnSpy = mock.method(console, "warn", () => {});
    try {
      const deps = makePasswordResetDeps({
        getRestaurantLimiter: () => ({
          limit: async () => {
            throw new Error("upstash timeout");
          },
        }),
      });
      const result = await evaluateMasterAdminPasswordResetRateLimit("admin-6", "rest-6", deps);

      assert.deepEqual(result, { allowed: true });
      assert.ok(warnSpy.mock.calls.length >= 1);
    } finally {
      warnSpy.mock.restore();
    }
  });
});
