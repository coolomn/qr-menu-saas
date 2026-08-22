import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PUBLIC_MENU_CDN_S_MAXAGE_SECONDS,
  PUBLIC_MENU_CDN_STALE_WHILE_REVALIDATE_SECONDS,
  PUBLIC_MENU_ERROR_CACHE_HEADERS,
  PUBLIC_MENU_SUCCESS_CACHE_CONTROL,
  PUBLIC_MENU_SUCCESS_CACHE_HEADERS,
  publicMenuApiPath,
  publicMenuBootstrapApiPath,
  publicMenuCacheHeadersForStatus,
} from "./cache-headers";
import { publicMenuJsonResponse } from "./public-menu-route-response";
import { PUBLIC_MENU_FETCH_OPTIONS } from "./public-menu-client";

describe("public menu CDN cache headers", () => {
  it("uses short CDN TTL with browser revalidation for 200 responses", () => {
    assert.equal(
      PUBLIC_MENU_SUCCESS_CACHE_HEADERS["Cache-Control"],
      PUBLIC_MENU_SUCCESS_CACHE_CONTROL
    );
    assert.match(PUBLIC_MENU_SUCCESS_CACHE_CONTROL, /^public,/);
    assert.match(PUBLIC_MENU_SUCCESS_CACHE_CONTROL, /max-age=0/);
    assert.match(
      PUBLIC_MENU_SUCCESS_CACHE_CONTROL,
      new RegExp(`s-maxage=${PUBLIC_MENU_CDN_S_MAXAGE_SECONDS}`)
    );
    assert.match(
      PUBLIC_MENU_SUCCESS_CACHE_CONTROL,
      new RegExp(`stale-while-revalidate=${PUBLIC_MENU_CDN_STALE_WHILE_REVALIDATE_SECONDS}`)
    );
  });

  it("uses no-store for error responses", () => {
    assert.equal(PUBLIC_MENU_ERROR_CACHE_HEADERS["Cache-Control"], "no-store, max-age=0");
    assert.deepEqual(publicMenuCacheHeadersForStatus(400), PUBLIC_MENU_ERROR_CACHE_HEADERS);
    assert.deepEqual(publicMenuCacheHeadersForStatus(403), PUBLIC_MENU_ERROR_CACHE_HEADERS);
    assert.deepEqual(publicMenuCacheHeadersForStatus(404), PUBLIC_MENU_ERROR_CACHE_HEADERS);
    assert.deepEqual(publicMenuCacheHeadersForStatus(500), PUBLIC_MENU_ERROR_CACHE_HEADERS);
    assert.deepEqual(publicMenuCacheHeadersForStatus(503), PUBLIC_MENU_ERROR_CACHE_HEADERS);
  });

  it("applies success headers only to 200", () => {
    assert.deepEqual(publicMenuCacheHeadersForStatus(200), PUBLIC_MENU_SUCCESS_CACHE_HEADERS);
  });
});

describe("public menu route response helper", () => {
  it("sets bootstrap and full success responses to the same cache policy", async () => {
    const success = publicMenuJsonResponse({ ok: true }, 200);
    assert.equal(success.status, 200);
    assert.equal(
      success.headers.get("Cache-Control"),
      PUBLIC_MENU_SUCCESS_CACHE_HEADERS["Cache-Control"]
    );

    const error = publicMenuJsonResponse({ error: "x" }, 404);
    assert.equal(error.status, 404);
    assert.equal(error.headers.get("Cache-Control"), PUBLIC_MENU_ERROR_CACHE_HEADERS["Cache-Control"]);
  });
});

describe("public menu cache key isolation", () => {
  it("builds distinct slug-scoped API paths", () => {
    assert.equal(publicMenuApiPath("cafe-a"), "/api/public-menu/cafe-a");
    assert.equal(publicMenuApiPath("cafe-b"), "/api/public-menu/cafe-b");
    assert.notEqual(publicMenuApiPath("cafe-a"), publicMenuApiPath("cafe-b"));
    assert.equal(
      publicMenuBootstrapApiPath("cafe-a"),
      "/api/public-menu/cafe-a/bootstrap"
    );
    assert.notEqual(
      publicMenuBootstrapApiPath("cafe-a"),
      publicMenuBootstrapApiPath("cafe-b")
    );
  });

  it("encodes slug segments for safe cache keys", () => {
    assert.equal(publicMenuApiPath("a/b"), "/api/public-menu/a%2Fb");
    assert.equal(publicMenuBootstrapApiPath("a b"), "/api/public-menu/a%20b/bootstrap");
  });
});

describe("public menu client fetch cache", () => {
  it("does not force browser no-store so CDN s-maxage can apply", () => {
    assert.equal("cache" in PUBLIC_MENU_FETCH_OPTIONS, false);
  });
});
