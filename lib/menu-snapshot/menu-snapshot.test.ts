import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMenuSnapshot, listMenuSnapshots, restoreMenuSnapshot } from "./index";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

/**
 * Bellek içi minimal Supabase taklidi: select/eq/in/gt/order/range/limit/maybeSingle/single,
 * insert (+select().single()), upsert(ignoreDuplicates), delete().eq/in.
 * failOn: { "tablo:işlem": true } ile hata üretilir.
 */
function fakeDb(db: Db, failOn: Record<string, boolean> = {}) {
  let idSeq = 0;
  const from = (table: string) => {
    db[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "upsert" | "delete" = "select";
    let payload: Row[] = [];
    let upsertKeys: string[] = [];
    let head = false;
    let rangeArgs: [number, number] | null = null;
    let limitN: number | null = null;
    let single: "single" | "maybe" | null = null;

    const run = () => {
      if (failOn[`${table}:${op}`]) return { data: null, error: { message: `${table} ${op} failed` }, count: null };
      if (op === "insert") {
        const rows = payload.map((r) => ({ id: r.id ?? `gen-${++idSeq}`, ...r }));
        db[table].push(...rows);
        return { data: single ? rows[0] : rows, error: null };
      }
      if (op === "upsert") {
        for (const r of payload) {
          const exists = db[table].some((e) => upsertKeys.every((k) => e[k] === r[k]));
          if (!exists) db[table].push({ ...r });
        }
        return { data: null, error: null };
      }
      const matched = db[table].filter((r) => filters.every((f) => f(r)));
      if (op === "delete") {
        db[table] = db[table].filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      if (head) return { data: null, error: null, count: matched.length };
      let rows = matched;
      if (rangeArgs) rows = rows.slice(rangeArgs[0], rangeArgs[1] + 1);
      if (limitN != null) rows = rows.slice(0, limitN);
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    };

    const chain: Record<string, unknown> = {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (opts?.head) head = true;
        return chain;
      },
      insert: (rows: Row | Row[]) => {
        op = "insert";
        payload = Array.isArray(rows) ? rows : [rows];
        return chain;
      },
      upsert: (rows: Row[], opts: { onConflict: string }) => {
        op = "upsert";
        payload = rows;
        upsertKeys = opts.onConflict.split(",");
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain),
      gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), chain),
      order: () => chain,
      range: (a: number, b: number) => ((rangeArgs = [a, b]), chain),
      limit: (n: number) => ((limitN = n), chain),
      single: () => ((single = "single"), chain),
      maybeSingle: () => ((single = "maybe"), chain),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const R = "rest-1";
function seedMenu(): Db {
  return {
    categories: [
      { id: "c1", restaurant_id: R, name: "Kahve" },
      { id: "c2", restaurant_id: R, name: "Tatlı" },
      { id: "cx", restaurant_id: "other", name: "Başka" },
    ],
    products: [
      { id: "p1", restaurant_id: R, category_id: "c1", name: "Latte" },
      { id: "p2", restaurant_id: R, category_id: "c2", name: "Brownie" },
      { id: "px", restaurant_id: "other", category_id: "cx", name: "Başka" },
    ],
    product_variants: [{ id: "v1", restaurant_id: R, product_id: "p1", label: "Büyük" }],
    menu_collections: [{ id: "m1", restaurant_id: R, name: "Ana Menü" }],
    category_menu_collections: [{ category_id: "c1", menu_collection_id: "m1" }],
    product_menu_collections: [{ product_id: "p1", menu_collection_id: "m1" }],
    menu_snapshots: [],
  };
}

function wipeMenu(db: Db) {
  db.product_menu_collections = [];
  db.category_menu_collections = [];
  db.product_variants = [];
  db.products = db.products.filter((r) => r.restaurant_id !== R);
  db.categories = db.categories.filter((r) => r.restaurant_id !== R);
}

describe("createMenuSnapshot", () => {
  it("captures only this restaurant's full menu", async () => {
    const db = seedMenu();
    const res = await createMenuSnapshot(fakeDb(db), R);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.snapshotId);
    assert.deepEqual(res.counts, { categories: 2, products: 2, product_variants: 1, menu_collections: 1 });
    const snap = db.menu_snapshots[0] as { restaurant_id: string; data: Record<string, Row[]> };
    assert.equal(snap.restaurant_id, R);
    assert.deepEqual(snap.data.products.map((p) => p.id).sort(), ["p1", "p2"]);
    assert.equal(snap.data.category_menu_collections.length, 1);
    assert.equal(snap.data.product_menu_collections.length, 1);
  });

  it("skips the snapshot when the menu is empty", async () => {
    const db = seedMenu();
    wipeMenu(db);
    const res = await createMenuSnapshot(fakeDb(db), R);
    assert.deepEqual(res.ok && res.snapshotId, null);
    assert.equal(db.menu_snapshots.length, 0);
  });

  it("fails (so the caller must not delete) when the snapshot cannot be written", async () => {
    const db = seedMenu();
    const res = await createMenuSnapshot(fakeDb(db, { "menu_snapshots:insert": true }), R);
    assert.equal(res.ok, false);
  });

  it("fails when a menu table cannot be read", async () => {
    const db = seedMenu();
    const res = await createMenuSnapshot(fakeDb(db, { "products:select": true }), R);
    assert.equal(res.ok, false);
    assert.equal(db.menu_snapshots.length, 0);
  });
});

describe("restoreMenuSnapshot", () => {
  async function snapshotThenWipe() {
    const db = seedMenu();
    const created = await createMenuSnapshot(fakeDb(db), R);
    assert.ok(created.ok && created.snapshotId);
    wipeMenu(db);
    return { db, snapshotId: (created as { snapshotId: string }).snapshotId };
  }

  it("restores the same rows with original ids into an empty menu", async () => {
    const { db, snapshotId } = await snapshotThenWipe();
    const res = await restoreMenuSnapshot(fakeDb(db), snapshotId, R);
    assert.equal(res.ok, true);
    assert.deepEqual(db.categories.filter((c) => c.restaurant_id === R).map((c) => c.id).sort(), ["c1", "c2"]);
    assert.deepEqual(db.products.filter((p) => p.restaurant_id === R).map((p) => p.id).sort(), ["p1", "p2"]);
    assert.equal(db.product_variants.length, 1);
    assert.equal(db.menu_collections.length, 1, "existing collection is not duplicated");
    assert.equal(db.product_menu_collections.length, 1);
    assert.equal(db.category_menu_collections.length, 1);
  });

  it("refuses to overwrite a non-empty menu", async () => {
    const db = seedMenu();
    const created = await createMenuSnapshot(fakeDb(db), R);
    assert.ok(created.ok && created.snapshotId);
    const res = await restoreMenuSnapshot(fakeDb(db), created.snapshotId as string, R);
    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.status, 409);
    assert.equal(db.products.length, 3);
  });

  it("rejects a snapshot that belongs to another restaurant", async () => {
    const { db, snapshotId } = await snapshotThenWipe();
    const res = await restoreMenuSnapshot(fakeDb(db), snapshotId, "other");
    assert.equal(!res.ok && res.status, 404);
  });

  it("rejects an expired snapshot", async () => {
    const { db, snapshotId } = await snapshotThenWipe();
    db.menu_snapshots[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const res = await restoreMenuSnapshot(fakeDb(db), snapshotId, R);
    assert.equal(!res.ok && res.status, 404);
  });

  it("rolls back partial writes when a step fails", async () => {
    const { db, snapshotId } = await snapshotThenWipe();
    const res = await restoreMenuSnapshot(fakeDb(db, { "product_variants:insert": true }), snapshotId, R);
    assert.equal(res.ok, false);
    assert.equal(db.categories.filter((c) => c.restaurant_id === R).length, 0);
    assert.equal(db.products.filter((p) => p.restaurant_id === R).length, 0);
    assert.equal(db.categories.length, 1, "other restaurant untouched");
  });
});

describe("listMenuSnapshots", () => {
  it("lists only unexpired snapshots of the restaurant", async () => {
    const db = seedMenu();
    db.menu_snapshots = [
      { id: "s1", restaurant_id: R, expires_at: new Date(Date.now() + 1e6).toISOString() },
      { id: "s2", restaurant_id: R, expires_at: new Date(Date.now() - 1e6).toISOString() },
      { id: "s3", restaurant_id: "other", expires_at: new Date(Date.now() + 1e6).toISOString() },
    ];
    const res = await listMenuSnapshots(fakeDb(db), R);
    assert.deepEqual(res.ok && res.snapshots.map((s) => s.id), ["s1"]);
  });
});
