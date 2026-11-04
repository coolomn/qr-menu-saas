import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLockDate, getTenantLockState } from "./lock-state";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = "2026-01-15T10:00:00.000Z";

describe("getTenantLockState", () => {
  it("is unlocked for active tenants with a future or missing end date", () => {
    assert.deepEqual(getTenantLockState({ tenant_status: "active", subscription_ends_at: future }), { locked: false });
    assert.deepEqual(getTenantLockState({ tenant_status: "active", subscription_ends_at: null }), { locked: false });
    assert.deepEqual(getTenantLockState({}), { locked: false });
  });

  it("locks as expired when the end date has passed", () => {
    assert.deepEqual(getTenantLockState({ tenant_status: "active", subscription_ends_at: past }), {
      locked: true,
      reason: "expired",
      endsAt: past,
    });
  });

  it("locks as suspended regardless of end date", () => {
    const s = getTenantLockState({ tenant_status: "suspended", subscription_ends_at: future });
    assert.equal(s.locked, true);
    if (s.locked) assert.equal(s.reason, "suspended");
  });

  it("treats tenant_status expired as expired", () => {
    const s = getTenantLockState({ tenant_status: "expired", subscription_ends_at: null });
    assert.equal(s.locked, true);
    if (s.locked) assert.equal(s.reason, "expired");
  });
});

describe("formatLockDate", () => {
  it("formats in Turkish and handles bad input", () => {
    assert.equal(formatLockDate(past), "15 Ocak 2026");
    assert.equal(formatLockDate(null), null);
    assert.equal(formatLockDate("nope"), null);
  });
});
