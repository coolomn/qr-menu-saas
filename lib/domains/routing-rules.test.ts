import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRedirectUrl,
  getRewrittenUrl,
  isRewrite,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import { buildDomainAfterFilesRewrites, buildDomainRedirects } from "./routing-rules";
import {
  canonicalMenuUrl,
  canonicalProductUrl,
  findHostSet,
  normalizeHostname,
  publicMenuUrl,
  publicProductUrl,
} from "./hosts";

const nextConfig = {
  async redirects() {
    return buildDomainRedirects();
  },
  async rewrites() {
    return { beforeFiles: [], afterFiles: buildDomainAfterFilesRewrites(), fallback: [] };
  },
};

async function route(url: string) {
  return unstable_getResponseFromNextConfig({ url, nextConfig });
}

async function expectRedirect(url: string, to: string) {
  const res = await route(url);
  assert.equal(res.status, 307, `${url} geçici yönlendirme olmalı`);
  assert.equal(getRedirectUrl(res), to);
}

async function expectRewrite(url: string, to: string) {
  const res = await route(url);
  assert.ok(isRewrite(res), `${url} rewrite olmalı`);
  assert.equal(getRewrittenUrl(res), to);
}

async function expectUntouched(url: string) {
  const res = await route(url);
  assert.equal(getRedirectUrl(res), null, `${url} yönlendirilmemeli`);
  assert.ok(!isRewrite(res), `${url} rewrite edilmemeli`);
}

describe("alan adı yönlendirme kuralları", () => {
  it("basılı QR adresi tapmenu.com.tr/menu/{slug} aynen çalışmaya devam eder", async () => {
    await expectUntouched("https://tapmenu.com.tr/menu/kafe-x");
    await expectUntouched("https://tapmenu.com.tr/menu/kafe-x?masa=5");
    await expectUntouched("https://www.tapmenu.com.tr/menu/kafe-x");
  });

  it("pazarlama sitesindeki panel adresleri app alan adına gider (yol ve sorgu korunur)", async () => {
    await expectRedirect("https://tapmenu.com.tr/admin", "https://app.tapmenu.com.tr/admin");
    await expectRedirect("https://tapmenu.com.tr/admin/login", "https://app.tapmenu.com.tr/admin/login");
    await expectRedirect(
      "https://www.tapmenu.com.tr/admin/master/abc",
      "https://app.tapmenu.com.tr/admin/master/abc"
    );
    await expectRedirect(
      "https://tapmenu.com.tr/admin/auth/set-password?x=1",
      "https://app.tapmenu.com.tr/admin/auth/set-password?x=1"
    );
  });

  it("tam /admin için ayrı kural var (Vercel'de boş yol '/admin/' üretip fazladan yönlendirme yapmasın)", () => {
    const rules = buildDomainRedirects();
    assert.ok(rules.some((r) => r.source === "/admin" && r.destination === "https://app.tapmenu.com.tr/admin"));
    assert.ok(rules.every((r) => !r.source.includes(":path*")), "':path*' kullanılmamalı");
  });

  it("pazarlama ana sayfası olduğu gibi kalır", async () => {
    await expectUntouched("https://tapmenu.com.tr/");
  });

  it("qr alan adında kısa adres menüye yönlenir, adres çubuğu kısa kalır", async () => {
    await expectRewrite("https://qr.tapmenu.com.tr/kafe-x", "https://qr.tapmenu.com.tr/menu/kafe-x");
    await expectRewrite("https://qr.tapmenu.com.tr/kafe-x?masa=5", "https://qr.tapmenu.com.tr/menu/kafe-x?masa=5");
  });

  it("ürün detay adresi qr alan adında /{slug}/p/{ürün} olarak çalışır", async () => {
    await expectRewrite(
      "https://qr.tapmenu.com.tr/kafe-x/p/abc-123",
      "https://qr.tapmenu.com.tr/menu/kafe-x/p/abc-123"
    );
    await expectRewrite(
      "https://qr-test.tapmenu.com.tr/kafe-x/p/abc-123",
      "https://qr-test.tapmenu.com.tr/menu/kafe-x/p/abc-123"
    );
    // eski adres (pazarlama alan adı) aynen çalışır
    await expectUntouched("https://tapmenu.com.tr/menu/kafe-x/p/abc-123");
    // app alan adında menü/ürün açılmaz → qr'a taşınır
    await expectRedirect(
      "https://app.tapmenu.com.tr/menu/kafe-x/p/abc-123",
      "https://qr.tapmenu.com.tr/kafe-x/p/abc-123"
    );
  });

  it("qr alan adında panel açılmaz; kök adres pazarlama sitesine gider", async () => {
    await expectRedirect("https://qr.tapmenu.com.tr/admin", "https://app.tapmenu.com.tr/admin");
    await expectRedirect("https://qr.tapmenu.com.tr/admin/login", "https://app.tapmenu.com.tr/admin/login");
    await expectRedirect("https://qr.tapmenu.com.tr/", "https://tapmenu.com.tr/");
  });

  it("qr alan adında çok parçalı yollar (api vb.) kısa adres kuralına takılmaz", async () => {
    await expectUntouched("https://qr.tapmenu.com.tr/api/public-menu/kafe-x");
    await expectUntouched("https://qr.tapmenu.com.tr/_next/static/chunks/a.js");
  });

  it("app alan adında kök panele gider, menü qr alan adına taşınır", async () => {
    await expectRedirect("https://app.tapmenu.com.tr/", "https://app.tapmenu.com.tr/admin");
    await expectRedirect("https://app.tapmenu.com.tr/menu/kafe-x", "https://qr.tapmenu.com.tr/kafe-x");
    await expectUntouched("https://app.tapmenu.com.tr/admin/login");
    await expectUntouched("https://app.tapmenu.com.tr/kafe-x");
  });

  it("alan adı eşleşmesi tam eşleşmedir (benzer adlar etkilenmez)", async () => {
    await expectUntouched("https://evil-tapmenu.com.tr/admin");
    await expectUntouched("https://qrxtapmenu.com.tr/kafe-x");
    await expectUntouched("https://qr.tapmenu.com.tr.evil.com/kafe-x");
  });

  it("Vercel önizleme ve yerel adreslerde hiçbir kural çalışmaz", async () => {
    await expectUntouched("https://qr-menu-saas-git-x.vercel.app/admin");
    await expectUntouched("https://qr-menu-saas-git-x.vercel.app/menu/kafe-x");
    await expectUntouched("http://localhost:3000/admin");
  });

  it("test takma adları canlıyla aynı kuralları kendi içinde uygular", async () => {
    await expectRedirect("https://site-test.tapmenu.com.tr/admin", "https://app-test.tapmenu.com.tr/admin");
    await expectRewrite(
      "https://qr-test.tapmenu.com.tr/kafe-x",
      "https://qr-test.tapmenu.com.tr/menu/kafe-x"
    );
    await expectRedirect(
      "https://app-test.tapmenu.com.tr/menu/kafe-x",
      "https://qr-test.tapmenu.com.tr/kafe-x"
    );
  });
});

describe("menü adresi yardımcıları", () => {
  it("alan adını normalleştirir", () => {
    assert.equal(normalizeHostname("App.TapMenu.com.tr:443"), "app.tapmenu.com.tr");
    assert.equal(normalizeHostname("qr.tapmenu.com.tr."), "qr.tapmenu.com.tr");
    assert.equal(normalizeHostname(null), "");
  });

  it("bilinen alan adlarını tanır", () => {
    assert.equal(findHostSet("app.tapmenu.com.tr")?.menu, "qr.tapmenu.com.tr");
    assert.equal(findHostSet("www.tapmenu.com.tr")?.menu, "qr.tapmenu.com.tr");
    assert.equal(findHostSet("app-test.tapmenu.com.tr")?.menu, "qr-test.tapmenu.com.tr");
    assert.equal(findHostSet("localhost"), null);
  });

  it("canlıda menü linki qr alan adına, önizlemede aynı siteye gider", () => {
    assert.equal(publicMenuUrl("kafe-x", "app.tapmenu.com.tr"), "https://qr.tapmenu.com.tr/kafe-x");
    assert.equal(publicMenuUrl("kafe-x", "tapmenu.com.tr"), "https://qr.tapmenu.com.tr/kafe-x");
    assert.equal(
      publicMenuUrl("kafe-x", "app-test.tapmenu.com.tr"),
      "https://qr-test.tapmenu.com.tr/kafe-x"
    );
    assert.equal(
      publicMenuUrl("kafe-x", "qr-menu-saas-git-x.vercel.app", "https://qr-menu-saas-git-x.vercel.app"),
      "https://qr-menu-saas-git-x.vercel.app/menu/kafe-x"
    );
    assert.equal(publicMenuUrl(" kafe-x ", null), "/menu/kafe-x");
  });

  it("asıl (canonical) menü adresi her zaman canlı qr alan adıdır", () => {
    assert.equal(canonicalMenuUrl("kafe-x"), "https://qr.tapmenu.com.tr/kafe-x");
  });
});

describe("ürün adresi yardımcıları", () => {
  it("canlıda qr alan adına, önizlemede /menu altına gider", () => {
    assert.equal(
      publicProductUrl("kafe-x", "p1", "app.tapmenu.com.tr"),
      "https://qr.tapmenu.com.tr/kafe-x/p/p1"
    );
    assert.equal(
      publicProductUrl("kafe-x", "p1", "abc.vercel.app", "https://abc.vercel.app"),
      "https://abc.vercel.app/menu/kafe-x/p/p1"
    );
    assert.equal(canonicalProductUrl("kafe-x", "p1"), "https://qr.tapmenu.com.tr/kafe-x/p/p1");
  });
});
