import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateRestaurantBody } from "./create-payload";
import {
  isReservedSlug,
  isValidSlug,
  RESERVED_SLUG_ERROR,
  RESERVED_SLUGS,
  reservedSlugChangeError,
} from "./slug";
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
    assert.equal(reservedSlugChangeError("api", "kafe-x"), RESERVED_SLUG_ERROR);
    assert.equal(reservedSlugChangeError("kafe-y", "kafe-x"), null);
  });

  it("adresi zaten listede olan eski restoranın diğer bilgileri kaydedilebilir (adres değişmiyorsa)", () => {
    assert.equal(reservedSlugChangeError("demo", "demo"), null);
    assert.equal(parseUpdateRestaurantBody({ slug: "demo", name: "Demo Kafe" }).ok, true);
  });
});
