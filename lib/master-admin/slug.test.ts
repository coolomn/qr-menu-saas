import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateRestaurantBody } from "./create-payload";
import { isReservedSlug, isValidSlug, RESERVED_SLUG_ERROR, RESERVED_SLUGS } from "./slug";
import { parseUpdateRestaurantBody } from "./update-payload";

const createBody = (slug: string) => ({
  name: "Kafe X",
  slug,
  login_username: "kafex",
  owner_email: "owner@example.com",
  plan_type: "12_months",
});

describe("yasaklı restoran adresleri (slug)", () => {
  it("sistem yollarını ve gelecekteki site sayfalarını yasaklar", () => {
    for (const slug of ["admin", "api", "menu", "monitoring", "kayit", "fiyatlandirma", "app", "qr"]) {
      assert.equal(isReservedSlug(slug), true, slug);
    }
    assert.equal(isReservedSlug(" Admin "), true);
  });

  it("normal restoran adreslerine dokunmaz", () => {
    for (const slug of ["kafe-x", "tapmenu-cafe", "ugur-cafe", "admin-cafe", "menu-evi"]) {
      assert.equal(isReservedSlug(slug), false, slug);
    }
  });

  it("listedeki her ad geçerli slug biçiminde (aksi halde liste hiçbir şeyi engellemez)", () => {
    for (const slug of RESERVED_SLUGS) {
      assert.equal(isValidSlug(slug), true, slug);
    }
  });

  it("yeni restoran oluştururken yasaklı adres reddedilir", () => {
    const res = parseCreateRestaurantBody(createBody("admin"));
    assert.deepEqual(res, { ok: false, error: RESERVED_SLUG_ERROR });
    const ok = parseCreateRestaurantBody(createBody("kafe-x"));
    assert.equal(ok.ok, true);
  });

  it("restoran güncellerken yasaklı adrese geçilemez", () => {
    assert.deepEqual(parseUpdateRestaurantBody({ slug: "api" }), { ok: false, error: RESERVED_SLUG_ERROR });
    const ok = parseUpdateRestaurantBody({ slug: "kafe-x" });
    assert.equal(ok.ok, true);
  });
});
