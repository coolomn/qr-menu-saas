import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createDebouncedTrigger, isPublicMenuWrite, withMenuWriteWatch } from "./menu-write-watch";

const BASE = "https://example.supabase.co/rest/v1";

describe("isPublicMenuWrite", () => {
  it("detects writes to menu tables", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE", "patch"]) {
      assert.equal(isPublicMenuWrite(`${BASE}/products?id=eq.1`, { method }), true, method);
    }
    for (const table of ["restaurants", "categories", "product_variants", "menu_collections", "category_menu_collections", "product_menu_collections"]) {
      assert.equal(isPublicMenuWrite(`${BASE}/${table}`, { method: "POST" }), true, table);
    }
  });

  it("ignores reads", () => {
    assert.equal(isPublicMenuWrite(`${BASE}/products?select=*`), false);
    assert.equal(isPublicMenuWrite(`${BASE}/products`, { method: "GET" }), false);
    assert.equal(isPublicMenuWrite(`${BASE}/products`, { method: "HEAD" }), false);
  });

  it("ignores non-menu tables, auth, storage and rpc", () => {
    assert.equal(isPublicMenuWrite(`${BASE}/menu_import_jobs`, { method: "POST" }), false);
    assert.equal(isPublicMenuWrite("https://example.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" }), false);
    assert.equal(isPublicMenuWrite("https://example.supabase.co/storage/v1/object/menu-images/products/a.webp", { method: "POST" }), false);
    assert.equal(isPublicMenuWrite(`${BASE}/rpc/products`, { method: "POST" }), false);
  });

  it("reads method from a Request object and accepts URL inputs", () => {
    assert.equal(isPublicMenuWrite(new Request(`${BASE}/categories`, { method: "DELETE" })), true);
    assert.equal(isPublicMenuWrite(new URL(`${BASE}/categories`), { method: "POST" }), true);
  });
});

describe("withMenuWriteWatch", () => {
  const ok = () => new Response("{}", { status: 200 });

  it("notifies after a successful menu write and returns the original response", async () => {
    const onWrite = mock.fn();
    const original = ok();
    const wrapped = withMenuWriteWatch(async () => original, onWrite);
    const res = await wrapped(`${BASE}/products?id=eq.1`, { method: "PATCH" });
    assert.equal(res, original);
    assert.equal(onWrite.mock.callCount(), 1);
  });

  it("does not notify on failed writes or reads", async () => {
    const onWrite = mock.fn();
    const failing = withMenuWriteWatch(async () => new Response("{}", { status: 403 }), onWrite);
    await failing(`${BASE}/products`, { method: "PATCH" });
    const reading = withMenuWriteWatch(async () => ok(), onWrite);
    await reading(`${BASE}/products?select=*`);
    assert.equal(onWrite.mock.callCount(), 0);
  });

  it("never breaks the request if the notifier throws", async () => {
    const wrapped = withMenuWriteWatch(async () => ok(), () => {
      throw new Error("boom");
    });
    const res = await wrapped(`${BASE}/products`, { method: "POST" });
    assert.equal(res.status, 200);
  });

  it("propagates network errors unchanged", async () => {
    const wrapped = withMenuWriteWatch(async () => {
      throw new TypeError("offline");
    }, () => {});
    await assert.rejects(() => wrapped(`${BASE}/products`, { method: "POST" }), /offline/);
  });
});

describe("createDebouncedTrigger", () => {
  it("collapses bursts into a single run", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const run = mock.fn();
      const trigger = createDebouncedTrigger(run, 800);
      trigger.schedule();
      mock.timers.tick(500);
      trigger.schedule();
      mock.timers.tick(500);
      assert.equal(run.mock.callCount(), 0);
      assert.equal(trigger.pending(), true);
      mock.timers.tick(300);
      assert.equal(run.mock.callCount(), 1);
      assert.equal(trigger.pending(), false);
    } finally {
      mock.timers.reset();
    }
  });
});
