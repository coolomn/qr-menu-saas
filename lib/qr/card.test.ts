import assert from "node:assert/strict";
import test from "node:test";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";

import { setSvgSize } from "./svg";
import { buildCardSvg, buildPrintSheetHtml, CARD_HEIGHT, CARD_WIDTH, readableTextOn, wrapText, xmlEscape } from "./card";

const URL_TEXT = "https://qr.tapmenu.com.tr/didim-yacht-club?oda=101";

function base() {
  return {
    url: URL_TEXT,
    qr: { foreground: "#7c2d12", background: "#fff7ed", shape: "rounded" as const },
    restaurantName: "Didim Yacht Club",
    headline: "Menü için QR kodu okutun",
    label: { word: "Oda", value: "101" },
    accent: "#c2410c",
    cardBackground: "#ffffff",
    displayUrl: "qr.tapmenu.com.tr/didim-yacht-club",
  };
}

async function rasterize(svg: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const image = await loadImage(Buffer.from(setSvgSize(svg, CARD_WIDTH, CARD_HEIGHT)));
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  const d = ctx.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  return { data: new Uint8ClampedArray(d.data), width: CARD_WIDTH, height: CARD_HEIGHT };
}

test("kart: içindeki QR bütün kartın içinden okunabilir", async () => {
  const img = await rasterize(buildCardSvg(base()));
  assert.equal(jsQR(img.data, img.width, img.height)?.data, URL_TEXT);
});

test("kart: etiketsiz ve logosuz da okunabilir; koyu kart zeminiyle de", async () => {
  const svg = buildCardSvg({ ...base(), label: null, displayUrl: null, cardBackground: "#0f172a", accent: "#38bdf8" });
  const img = await rasterize(svg);
  assert.equal(jsQR(img.data, img.width, img.height)?.data, URL_TEXT);
});

test("kart: metinler kaçışlanır, enjeksiyon olmaz", () => {
  const svg = buildCardSvg({ ...base(), restaurantName: '<script>alert("x")</script> & Co', headline: "<b>hi</b>", label: { word: "Masa", value: '"><x>' } });
  assert.ok(!svg.includes("<script"));
  assert.ok(!svg.includes("<b>"));
  assert.ok(!svg.includes('"><x>'));
  assert.ok(svg.includes("&amp; Co"));
});

test("kart: geçersiz logo adresi yok sayılır", () => {
  const svg = buildCardSvg({ ...base(), logoHref: "https://evil.example/logo.png" });
  assert.ok(!svg.includes("evil.example"));
});

test("wrapText: satıra böler, taşanı keser", () => {
  assert.deepEqual(wrapText("Didim Yacht Club", 18, 2), ["Didim Yacht Club"]);
  assert.deepEqual(wrapText("Çok Uzun Bir Restoran Adı Burada", 12, 2), ["Çok Uzun Bir", "Restoran Ad…"]);
  assert.deepEqual(wrapText("Supercalifragilisticexpialidocious", 10, 2), ["Supercali…"]);
  assert.deepEqual(wrapText("", 10, 2), []);
});

test("xmlEscape / readableTextOn", () => {
  assert.equal(xmlEscape(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(readableTextOn("#ffffff"), "#111827");
  assert.equal(readableTextOn("#0f172a"), "#ffffff");
});

test("yazdırma sayfası: kart sayısına göre sayfa böler", () => {
  const cards = Array.from({ length: 9 }, (_, i) => `<svg data-n="${i}"></svg>`);
  const four = buildPrintSheetHtml({ cards, layout: "a6-4", title: "t" });
  assert.equal((four.match(/<section class="page">/g) ?? []).length, 3);
  assert.ok(four.includes("size: A4 portrait"));
  const two = buildPrintSheetHtml({ cards, layout: "a5-2", title: "t" });
  assert.equal((two.match(/<section class="page">/g) ?? []).length, 5);
  assert.ok(two.includes("size: A4 landscape"));
  const one = buildPrintSheetHtml({ cards, layout: "a4-1", title: "<t>" });
  assert.equal((one.match(/<section class="page">/g) ?? []).length, 9);
  assert.ok(one.includes("<title>&lt;t&gt;</title>"));
});

test("kart SVG'si PNG için yeniden boyutlandırıldığında geçerli kalır (tek width/height)", () => {
  const svg = setSvgSize(buildCardSvg(base()), 1240, 1748);
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? "";
  assert.equal((root.match(/\swidth=/g) ?? []).length, 1);
  assert.equal((root.match(/\sheight=/g) ?? []).length, 1);
});

test("kart: emoji/yarım vekil ve XML'de geçersiz karakterler SVG'yi bozmaz", () => {
  const name = "Cafe 🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔🍔";
  const svg = buildCardSvg({ ...base(), restaurantName: name, headline: "x\u0000y\u0008z \uD83D lone", label: { word: "Masa", value: "A\u0001B" } });
  assert.doesNotThrow(() => encodeURIComponent(svg));
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(svg));
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(svg));
});

test("wrapText: emoji ortadan kesilmez", () => {
  const lines = wrapText("🍔".repeat(30), 10, 2);
  for (const l of lines) assert.doesNotThrow(() => encodeURIComponent(l));
});

test("kart: uzun etiket yazı boyutunu küçültür, bandın içinde kalır", () => {
  const short = buildCardSvg({ ...base(), label: { word: "Oda", value: "101" } });
  const long = buildCardSvg({ ...base(), label: { word: "Masa", value: "WWWWWWWWWWWWWWWW" } });
  const size = (svg: string) => Number(/font-size="(\d+)"[^>]*letter-spacing/.exec(svg)?.[1]);
  assert.equal(size(short), 76);
  assert.ok(size(long) < 76 && size(long) >= 40);
});

test("kart: küçük baskı boyutunda ve hafif bulanıklıkta da okunur", async () => {
  const svg = buildCardSvg(base());
  const px = 260; // ~2.6 cm kod ≈ kartın tamamı bu boyutta küçültülürse
  const w = px;
  const h = Math.round((px * CARD_HEIGHT) / CARD_WIDTH);
  const image = await loadImage(Buffer.from(setSvgSize(svg, w, h)));
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.filter = "blur(0.6px)";
  ctx.drawImage(image, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const out = jsQR(new Uint8ClampedArray(d.data), w, h);
  assert.equal(out?.data, URL_TEXT);
});
