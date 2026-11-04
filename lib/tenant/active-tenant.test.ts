import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isTenantInactive,
  requireActiveOwnedRestaurant,
  RESTAURANT_FORBIDDEN_MESSAGE,
  TENANT_INACTIVE_MESSAGE,
} from "./active-tenant";

type Row = { id: string; owner_id: string; tenant_status: string | null; subscription_ends_at: string | null };

/** restaurants tablosunu taklit eden minimal sorgu zinciri (select/eq/limit). */
function fakeAdmin(rows: Row[], opts: { error?: boolean } = {}) {
  const filters: Array<[string, string]> = [];
  const chain = {
    select: () => chain,
    eq: (col: string, val: string) => {
      filters.push([col, val]);
      return chain;
    },
    limit: async (n: number) => {
      if (opts.error) return { data: null, error: { message: "boom" } };
      const data = rows
        .filter((r) => filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v))
        .slice(0, n);
      return { data, error: null };
    },
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("isTenantInactive", () => {
  it("treats active with future or no end date as active", () => {
    assert.equal(isTenantInactive({ id: "r", tenant_status: "active", subscription_ends_at: future }), false);
    assert.equal(isTenantInactive({ id: "r", tenant_status: "active", subscription_ends_at: null }), false);
  });

  it("treats suspended, expired, or past end date as inactive", () => {
    assert.equal(isTenantInactive({ id: "r", tenant_status: "suspended", subscription_ends_at: future }), true);
    assert.equal(isTenantInactive({ id: "r", tenant_status: "expired", subscription_ends_at: null }), true);
    assert.equal(isTenantInactive({ id: "r", tenant_status: "active", subscription_ends_at: past }), true);
  });
});

describe("requireActiveOwnedRestaurant", () => {
  const rows: Row[] = [
    { id: "r-active", owner_id: "u1", tenant_status: "active", subscription_ends_at: future },
    { id: "r-expired", owner_id: "u1", tenant_status: "active", subscription_ends_at: past },
    { id: "r-other", owner_id: "u2", tenant_status: "active", subscription_ends_at: future },
    { id: "r-suspended", owner_id: "u3", tenant_status: "suspended", subscription_ends_at: future },
  ];

  it("allows an owned, active restaurant", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows), { userId: "u1", restaurantId: "r-active" });
    assert.deepEqual(res, { ok: true, restaurantId: "r-active" });
  });

  it("rejects an owned restaurant whose subscription ended", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows), { userId: "u1", restaurantId: "r-expired" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 403);
    assert.equal(res.reason, "inactive");
    assert.equal(res.error, TENANT_INACTIVE_MESSAGE);
  });

  it("rejects another owner's restaurant as forbidden", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows), { userId: "u1", restaurantId: "r-other" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.reason, "forbidden");
    assert.equal(res.error, RESTAURANT_FORBIDDEN_MESSAGE);
  });

  it("without restaurantId, allows when the user has at least one active restaurant", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows), { userId: "u1" });
    assert.deepEqual(res, { ok: true, restaurantId: "r-active" });
  });

  it("without restaurantId, rejects when every owned restaurant is inactive", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows), { userId: "u3" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.reason, "inactive");
  });

  it("without restaurantId, rejects a user with no restaurants", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows), { userId: "nobody" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.reason, "forbidden");
  });

  it("returns a 500 db_error when the lookup fails", async () => {
    const res = await requireActiveOwnedRestaurant(fakeAdmin(rows, { error: true }), { userId: "u1", restaurantId: "r-active" });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.status, 500);
    assert.equal(res.reason, "db_error");
  });
});
