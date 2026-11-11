import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteExpiredMenuSnapshots,
  isAuthorizedCronRequest,
  markExpiredSubscriptions,
  statusAfterEndDateChange,
} from "./daily-maintenance";

const NOW = new Date("2026-11-11T03:00:00Z");
const PAST = "2026-11-01T00:00:00Z";
const FUTURE = "2027-05-01T00:00:00Z";

type Sub = { restaurant_id: string; status: string; ends_at: string | null };
type Rest = { id: string; tenant_status: string };

/** Yalnızca bu modülün kullandığı zincirleri taklit eden küçük sahte Supabase. */
function fakeAdmin(subs: Sub[], rests: Rest[], opts: { failRestaurantUpdate?: string } = {}) {
  const events: Array<Record<string, unknown>> = [];
  let snapshots = [
    { id: "s-old", expires_at: PAST },
    { id: "s-new", expires_at: FUTURE },
  ];

  function builder(table: string) {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let op: "select" | "update" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    const api = {
      select() {
        return api;
      },
      update(p: Record<string, unknown>) {
        op = "update";
        patch = p;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      insert(row: Record<string, unknown>) {
        events.push(row);
        return Promise.resolve({ error: null });
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return api;
      },
      not(col: string) {
        filters.push((r) => r[col] !== null);
        return api;
      },
      lt(col: string, v: string) {
        filters.push((r) => typeof r[col] === "string" && (r[col] as string) < v);
        return api;
      },
      then(resolve: (v: unknown) => void) {
        const rows = (table === "restaurant_subscriptions" ? subs : table === "restaurants" ? rests : snapshots) as Array<
          Record<string, unknown>
        >;
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (op === "update") {
          if (table === "restaurants" && hit.some((r) => r.id === opts.failRestaurantUpdate)) {
            return resolve({ data: null, error: { message: "boom" } });
          }
          hit.forEach((r) => Object.assign(r, patch));
        }
        if (op === "delete") snapshots = snapshots.filter((s) => !hit.includes(s));
        resolve({ data: hit.map((r) => ({ ...r })), error: null });
      },
    };
    return api;
  }

  const admin = { from: (t: string) => builder(t) } as unknown as SupabaseClient;
  return { admin, events, snapshots: () => snapshots };
}

describe("markExpiredSubscriptions", () => {
  it("marks only active subscriptions whose end date passed, syncs restaurant, logs event, purges cache", async () => {
    const subs: Sub[] = [
      { restaurant_id: "r-due", status: "active", ends_at: PAST },
      { restaurant_id: "r-future", status: "active", ends_at: FUTURE },
      { restaurant_id: "r-forever", status: "active", ends_at: null },
      { restaurant_id: "r-suspended", status: "suspended", ends_at: PAST },
    ];
    const rests: Rest[] = subs.map((s) => ({ id: s.restaurant_id, tenant_status: s.status }));
    const { admin, events } = fakeAdmin(subs, rests);
    const purged: unknown[] = [];

    const res = await markExpiredSubscriptions(admin, NOW, async (ids) => {
      purged.push(ids);
      return "purged";
    });

    assert.deepEqual(res, { expired: ["r-due"], failed: [] });
    assert.equal(subs.find((s) => s.restaurant_id === "r-due")!.status, "expired");
    assert.equal(rests.find((r) => r.id === "r-due")!.tenant_status, "expired");
    assert.equal(subs.find((s) => s.restaurant_id === "r-suspended")!.status, "suspended");
    assert.equal(rests.find((r) => r.id === "r-future")!.tenant_status, "active");
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "expired");
    assert.equal(events[0].created_by, null);
    assert.deepEqual(purged, [["r-due"]]);
  });

  it("does nothing and skips purge when nothing is due", async () => {
    const { admin, events } = fakeAdmin([{ restaurant_id: "r", status: "active", ends_at: FUTURE }], [
      { id: "r", tenant_status: "active" },
    ]);
    let purgeCalls = 0;
    const res = await markExpiredSubscriptions(admin, NOW, async () => {
      purgeCalls++;
      return "purged";
    });
    assert.deepEqual(res, { expired: [], failed: [] });
    assert.equal(events.length, 0);
    assert.equal(purgeCalls, 0);
  });

  it("keeps going when one restaurant fails", async () => {
    const subs: Sub[] = [
      { restaurant_id: "r-bad", status: "active", ends_at: PAST },
      { restaurant_id: "r-good", status: "active", ends_at: PAST },
    ];
    const rests = subs.map((s) => ({ id: s.restaurant_id, tenant_status: "active" }));
    const { admin } = fakeAdmin(subs, rests, { failRestaurantUpdate: "r-bad" });
    const res = await markExpiredSubscriptions(admin, NOW, async () => "purged");
    assert.deepEqual(res, { expired: ["r-good"], failed: ["r-bad"] });
  });
});

describe("deleteExpiredMenuSnapshots", () => {
  it("deletes only snapshots past expires_at", async () => {
    const { admin, snapshots } = fakeAdmin([], []);
    assert.equal(await deleteExpiredMenuSnapshots(admin, NOW), 1);
    assert.deepEqual(
      snapshots().map((s) => s.id),
      ["s-new"]
    );
  });
});

describe("statusAfterEndDateChange", () => {
  it("reactivates expired subscriptions moved to a future or open end date", () => {
    assert.equal(statusAfterEndDateChange("expired", FUTURE, NOW), "active");
    assert.equal(statusAfterEndDateChange("expired", null, NOW), "active");
  });
  it("keeps expired when the new date is still in the past", () => {
    assert.equal(statusAfterEndDateChange("expired", PAST, NOW), "expired");
  });
  it("never touches suspended or active", () => {
    assert.equal(statusAfterEndDateChange("suspended", FUTURE, NOW), "suspended");
    assert.equal(statusAfterEndDateChange("active", PAST, NOW), "active");
  });
});

describe("isAuthorizedCronRequest", () => {
  const secret = "s".repeat(32);
  it("accepts the exact bearer secret", () => {
    assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, secret), true);
  });
  it("rejects wrong, missing, or unconfigured secrets", () => {
    assert.equal(isAuthorizedCronRequest(`Bearer ${"x".repeat(32)}`, secret), false);
    assert.equal(isAuthorizedCronRequest(null, secret), false);
    assert.equal(isAuthorizedCronRequest("Bearer ", ""), false);
    assert.equal(isAuthorizedCronRequest("Bearer undefined", undefined), false);
    assert.equal(isAuthorizedCronRequest("Bearer short", "short"), false);
  });
});
