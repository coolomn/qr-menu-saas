import assert from "node:assert/strict";
import test from "node:test";

import { buildQrTargetUrl, isProductionHost } from "./target";

test("canlı panelden üretilen kod kısa menü adresine gider (basılı QR biçimi)", () => {
  const host = "app.tapmenu.com.tr";
  assert.equal(buildQrTargetUrl({ slug: "didim-yacht-club", host, origin: `https://${host}` }), "https://qr.tapmenu.com.tr/didim-yacht-club");
  assert.equal(
    buildQrTargetUrl({ slug: "didim-yacht-club", host, label: { kind: "masa", value: "5" } }),
    "https://qr.tapmenu.com.tr/didim-yacht-club?masa=5"
  );
  assert.equal(
    buildQrTargetUrl({ slug: "didim-yacht-club", host, label: { kind: "oda", value: "Bahçe 3" } }),
    "https://qr.tapmenu.com.tr/didim-yacht-club?oda=Bah%C3%A7e%203"
  );
});

test("ana alan adından da canlı sayılır", () => {
  assert.equal(isProductionHost("tapmenu.com.tr"), true);
  assert.equal(isProductionHost("APP.tapmenu.com.tr:443"), true);
});

test("test takma adı, preview ve yerel adres canlı SAYILMAZ", () => {
  for (const h of ["app-test.tapmenu.com.tr", "qr-test.tapmenu.com.tr", "site-test.tapmenu.com.tr", "qr-menu-saas-abc.vercel.app", "localhost", "127.0.0.1", "", null, undefined]) {
    assert.equal(isProductionHost(h), false, String(h));
  }
});

test("yerel/preview adresinde kod o sitenin /menu/{slug} adresine gider", () => {
  assert.equal(
    buildQrTargetUrl({ slug: "cafe", host: "127.0.0.1", origin: "http://127.0.0.1:3000", label: { kind: "masa", value: "7" } }),
    "http://127.0.0.1:3000/menu/cafe?masa=7"
  );
});

test("boş etiket adresi değiştirmez", () => {
  assert.equal(buildQrTargetUrl({ slug: "cafe", host: "app.tapmenu.com.tr", label: { kind: "masa", value: "  " } }), "https://qr.tapmenu.com.tr/cafe");
});
