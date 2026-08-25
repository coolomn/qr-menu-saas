import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rateLimitedResponse } from "./respond";

describe("rateLimitedResponse", () => {
  it("returns a 429 with the Retry-After header set", async () => {
    const response = rateLimitedResponse(42);

    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "42");
  });

  it("rounds fractional retryAfterSeconds up", async () => {
    const response = rateLimitedResponse(10.2);

    assert.equal(response.headers.get("Retry-After"), "11");
  });

  it("clamps retryAfterSeconds to at least 1", async () => {
    const response = rateLimitedResponse(0);

    assert.equal(response.headers.get("Retry-After"), "1");
  });

  it("returns a fixed generic message without leaking internal details", async () => {
    const response = rateLimitedResponse(5);
    const body = (await response.json()) as { error: string };

    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(body.error, "Çok fazla istek gönderildi. Lütfen birazdan tekrar deneyin.");
  });
});
