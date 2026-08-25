import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkLimit, type RateLimiterLike } from "./client";

function fakeLimiter(
  response: { success: boolean; limit: number; remaining: number; reset: number }
): RateLimiterLike {
  return {
    limit: async () => response,
  };
}

describe("checkLimit", () => {
  it("returns allowed when the limiter reports success", async () => {
    const reset = Date.now() + 60_000;
    const limiter = fakeLimiter({ success: true, limit: 10, remaining: 7, reset });
    const result = await checkLimit(limiter, "user-1");

    assert.equal(result.state, "allowed");
    if (result.state !== "allowed") return;
    assert.equal(result.limit, 10);
    assert.equal(result.remaining, 7);
    assert.equal(result.reset, reset);
  });

  it("returns limited with a retryAfterSeconds derived from reset", async () => {
    const reset = Date.now() + 30_000;
    const limiter = fakeLimiter({ success: false, limit: 5, remaining: 0, reset });
    const result = await checkLimit(limiter, "user-2");

    assert.equal(result.state, "limited");
    if (result.state !== "limited") return;
    assert.equal(result.limit, 5);
    assert.ok(result.retryAfterSeconds >= 29 && result.retryAfterSeconds <= 30);
  });

  it("clamps retryAfterSeconds to at least 1 when reset is in the past", async () => {
    const limiter = fakeLimiter({ success: false, limit: 5, remaining: 0, reset: Date.now() - 5_000 });
    const result = await checkLimit(limiter, "user-3");

    assert.equal(result.state, "limited");
    if (result.state !== "limited") return;
    assert.equal(result.retryAfterSeconds, 1);
  });

  it("returns unavailable with the error message when the limiter throws", async () => {
    const limiter: RateLimiterLike = {
      limit: async () => {
        throw new Error("upstash timeout");
      },
    };
    const result = await checkLimit(limiter, "user-4");

    assert.equal(result.state, "unavailable");
    if (result.state !== "unavailable") return;
    assert.equal(result.reason, "upstash timeout");
  });

  it("returns unavailable with a generic reason when the limiter throws a non-Error value", async () => {
    const limiter: RateLimiterLike = {
      limit: async () => {
        throw "not an Error instance";
      },
    };
    const result = await checkLimit(limiter, "user-5");

    assert.equal(result.state, "unavailable");
    if (result.state !== "unavailable") return;
    assert.equal(result.reason, "unknown_error");
  });
});
