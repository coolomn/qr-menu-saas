import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isVercelPurgeAvailable, publicMenuCacheTag, purgePublicMenuCache } from "./cache-purge";
import { publicMenuJsonResponse } from "./public-menu-route-response";
import { VERCEL_CACHE_TAG_HEADER } from "./cache-headers";

describe("publicMenuCacheTag", () => {
  it("is restaurant-scoped", () => {
    assert.equal(publicMenuCacheTag("abc"), "menu-abc");
    assert.notEqual(publicMenuCacheTag("a"), publicMenuCacheTag("b"));
  });
});

describe("purgePublicMenuCache", () => {
  it("purges deduplicated tags for the given restaurants", async () => {
    const calls: string[][] = [];
    const res = await purgePublicMenuCache(["r1", "r2", "r1", " ", null], async (tags) => {
      calls.push(tags);
    }, () => true);
    assert.equal(res, "purged");
    assert.deepEqual(calls, [["menu-r1", "menu-r2"]]);
  });

  it("accepts a single id", async () => {
    const calls: string[][] = [];
    await purgePublicMenuCache("r9", async (tags) => {
      calls.push(tags);
    }, () => true);
    assert.deepEqual(calls, [["menu-r9"]]);
  });

  it("does nothing for an empty list", async () => {
    let called = false;
    assert.equal(await purgePublicMenuCache([], async () => void (called = true), () => true), "skipped");
    assert.equal(called, false);
  });

  it("never throws when the purge API fails (save must still succeed)", async () => {
    const res = await purgePublicMenuCache("r1", async () => {
      throw new Error("purge down");
    }, () => true);
    assert.equal(res, "failed");
  });

  it("reports unavailable outside Vercel without calling purge", async () => {
    let called = false;
    assert.equal(await purgePublicMenuCache("r1", async () => void (called = true)), "unavailable");
    assert.equal(called, false);
  });

  it("detects the Vercel request context purge API", async () => {
    const sym = Symbol.for("@vercel/request-context");
    const g = globalThis as Record<symbol, unknown>;
    const prev = g[sym];
    try {
      g[sym] = { get: () => ({ purge: { dangerouslyDeleteByTag: async () => {} } }) };
      assert.equal(isVercelPurgeAvailable(), true);
    } finally {
      g[sym] = prev;
    }
    assert.equal(isVercelPurgeAvailable(), false);
  });
});

describe("public menu response cache tag", () => {
  it("tags successful responses with the restaurant tag", () => {
    const res = publicMenuJsonResponse({ ok: true }, 200, { restaurantId: "r1" });
    assert.equal(res.headers.get(VERCEL_CACHE_TAG_HEADER), "menu-r1");
  });

  it("does not tag error responses", () => {
    const res = publicMenuJsonResponse({ error: "x" }, 403, { restaurantId: "r1" });
    assert.equal(res.headers.get(VERCEL_CACHE_TAG_HEADER), null);
  });

  it("leaves untagged responses unchanged when no restaurant is given", () => {
    const res = publicMenuJsonResponse({ ok: true }, 200);
    assert.equal(res.headers.get(VERCEL_CACHE_TAG_HEADER), null);
  });
});
