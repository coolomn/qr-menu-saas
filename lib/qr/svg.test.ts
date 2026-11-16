import assert from "node:assert/strict";
import test from "node:test";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";

import {
  buildQrSvg,
  contrastRatio,
  isSafeLogoHref,
  normalizeHexColor,
  qrColorWarning,
  setSvgSize,
  type QrDotShape,
} from "./svg";

const URL_TEXT = "https://qr.tapmenu.com.tr/didim-yacht-club?oda=101";

async function decode(svg: string, px = 700): Promise<string | null> {
  // SVG'yi hedef boyutta çiz (vektör: tarayıcıda da böyle işlenir); küçük boyutta çizip büyütmek bulanık olur.
  const sized = setSvgSize(svg, px, px);
  const image = await loadImage(Buffer.from(sized));
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  ctx.drawImage(image, 0, 0, px, px);
  const data = ctx.getImageData(0, 0, px, px);
  const result = jsQR(new Uint8ClampedArray(data.data), px, px);
  return result?.data ?? null;
}

function tinyLogoDataUrl(): string {
  const canvas = createCanvas(64, 64);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#d97706";
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

for (const shape of ["square", "rounded", "dots"] as QrDotShape[]) {
  test(`QR (${shape}) telefonla okunabilir: çözülen adres aynı`, async () => {
    const { svg } = buildQrSvg({ text: URL_TEXT, foreground: "#111827", background: "#ffffff", shape });
    assert.equal(await decode(svg), URL_TEXT);
  });

  test(`QR (${shape}) ortada logoyla da okunabilir`, async () => {
    const { svg, hasLogo } = buildQrSvg({
      text: URL_TEXT,
      foreground: "#7c2d12",
      background: "#fff7ed",
      shape,
      logoHref: tinyLogoDataUrl(),
    });
    assert.equal(hasLogo, true);
    assert.equal(await decode(svg), URL_TEXT);
  });
}

test("QR: uzun adres + logo en büyük oranda bile okunur", async () => {
  const text = `https://qr.tapmenu.com.tr/cok-uzun-bir-restoran-adi-ornegi-2026?masa=Bah%C3%A7e%2012&lang=en`;
  const { svg } = buildQrSvg({
    text,
    foreground: "#000000",
    background: "#ffffff",
    shape: "rounded",
    logoHref: tinyLogoDataUrl(),
    logoScale: 0.26,
  });
  assert.equal(await decode(svg, 900), text);
});

test("QR: renk girdisi güvenli — geçersiz renk varsayılana düşer, SVG'ye enjeksiyon olmaz", () => {
  const { svg } = buildQrSvg({
    text: "https://x.test/a",
    foreground: '"><script>alert(1)</script>',
    background: "javascript:alert(1)",
    logoHref: 'data:image/svg+xml;base64,"onload="alert(1)',
  });
  assert.ok(!svg.includes("<script"));
  assert.ok(!svg.includes("javascript:"));
  assert.ok(!svg.includes("onload"));
  assert.ok(svg.includes('fill="#111827"'));
  assert.ok(svg.includes('fill="#ffffff"'));
});

test("QR: şeffaf arka plan kabul edilir", () => {
  const { svg } = buildQrSvg({ text: "https://x.test/a", foreground: "#000000", background: "transparent" });
  assert.ok(!svg.includes("<rect"));
});

test("normalizeHexColor / isSafeLogoHref", () => {
  assert.equal(normalizeHexColor("#ABC", "#000000"), "#aabbcc");
  assert.equal(normalizeHexColor("#12345", "#000000"), "#000000");
  assert.equal(normalizeHexColor(undefined, "#123456"), "#123456");
  assert.equal(isSafeLogoHref("data:image/png;base64,AAAA"), true);
  assert.equal(isSafeLogoHref("data:image/svg+xml;base64,AAAA"), false);
  assert.equal(isSafeLogoHref("https://evil.example/x.png"), false);
  assert.equal(isSafeLogoHref(null), false);
});

test("renk uyarısı: düşük kontrast ve ters renk", () => {
  assert.equal(qrColorWarning("#000000", "#ffffff"), null);
  assert.equal(qrColorWarning("#ffffff", "#000000"), "inverted");
  assert.equal(qrColorWarning("#999999", "#aaaaaa"), "low-contrast");
  assert.equal(qrColorWarning("#000000", "transparent"), null);
  assert.ok(contrastRatio("#000000", "#ffffff") > 20);
});

test("setSvgSize: var olan width/height'i değiştirir, çift öznitelik üretmez", () => {
  const out = setSvgSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="105mm" height="148mm"><g/></svg>', 1240, 1748);
  assert.equal((out.match(/width=/g) ?? []).length, 1);
  assert.equal((out.match(/height=/g) ?? []).length, 1);
  assert.ok(out.includes('width="1240" height="1748"'));
  assert.ok(out.endsWith("<g/></svg>"));
  const plain = setSvgSize('<svg viewBox="0 0 1 1"></svg>', 5, 5);
  assert.ok(plain.includes('width="5" height="5"'));
});
