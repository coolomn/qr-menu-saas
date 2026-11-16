import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DARK_THEME_BG, MIN_TEXT_CONTRAST, WHITE, contrastRatio, ensureReadableOnWhite, parseHex, rgbToHsl, hslToRgb, toHex } from "./color-utils";
import { extractPalette } from "./palette";
import { suggestBrandColors, suggestFromPixels } from "./suggest";

/** n adet aynı renkli RGBA pikseli. */
function px(hex: string, n: number, alpha = 255): number[] {
  const c = parseHex(hex)!;
  return Array.from({ length: n }, () => [c.r, c.g, c.b, alpha]).flat();
}

describe("color utils", () => {
  it("parses and formats hex", () => {
    assert.deepEqual(parseHex("#2563eb"), { r: 37, g: 99, b: 235 });
    assert.deepEqual(parseHex("fff"), { r: 255, g: 255, b: 255 });
    assert.equal(parseHex("mavi"), null);
    assert.equal(parseHex("#12345"), null);
    assert.equal(toHex({ r: 37, g: 99, b: 235 }), "#2563eb");
    assert.equal(toHex({ r: -5, g: 300, b: 0.4 }), "#00ff00");
  });

  it("computes WCAG contrast (black/white = 21, same = 1)", () => {
    assert.equal(Math.round(contrastRatio({ r: 0, g: 0, b: 0 }, WHITE)), 21);
    assert.equal(contrastRatio(WHITE, WHITE), 1);
    // Bilinen değer: #767676 beyaza karşı ≈ 4.54
    assert.ok(Math.abs(contrastRatio(parseHex("#767676")!, WHITE) - 4.54) < 0.05);
  });

  it("round-trips HSL", () => {
    for (const hex of ["#2563eb", "#e11d48", "#16a34a", "#f59e0b"]) {
      const back = toHex(hslToRgb(rgbToHsl(parseHex(hex)!)));
      assert.equal(back, hex);
    }
  });

  it("keeps an already readable color unchanged", () => {
    const r = ensureReadableOnWhite("#1d4ed8")!;
    assert.equal(r.adjusted, false);
    assert.equal(r.hex, "#1d4ed8");
    assert.ok(r.ratio >= MIN_TEXT_CONTRAST);
  });

  it("darkens a pale color until it is readable on white, keeping the hue", () => {
    const r = ensureReadableOnWhite("#fbbf24")!; // sarı: beyazda okunmaz
    assert.equal(r.adjusted, true);
    assert.ok(r.ratio >= MIN_TEXT_CONTRAST, String(r.ratio));
    const before = rgbToHsl(parseHex("#fbbf24")!);
    const after = rgbToHsl(parseHex(r.hex)!);
    assert.ok(Math.abs(before.h - after.h) < 8, `ton korunmalı ${before.h} → ${after.h}`);
    assert.ok(after.l < before.l);
  });

  it("returns null for invalid input", () => {
    assert.equal(ensureReadableOnWhite("kırmızı"), null);
  });
});

describe("extractPalette", () => {
  it("returns nothing for an empty or fully transparent/white image", () => {
    assert.deepEqual(extractPalette([]), []);
    assert.deepEqual(extractPalette(px("#ff0000", 50, 0)), []);
    assert.deepEqual(extractPalette(px("#ffffff", 50)), []);
  });

  it("finds the dominant brand color and ignores white background and black outline", () => {
    const pixels = [...px("#ffffff", 600), ...px("#e11d48", 300), ...px("#000000", 60), ...px("#0ea5e9", 40)];
    const palette = extractPalette(pixels);
    assert.equal(palette[0].hex.length, 7);
    const top = parseHex(palette[0].hex)!;
    const red = parseHex("#e11d48")!;
    assert.ok(Math.abs(top.r - red.r) < 20 && Math.abs(top.g - red.g) < 20 && Math.abs(top.b - red.b) < 20, palette[0].hex);
    assert.ok(palette[0].share > 0.8 && palette[0].share <= 1);
    assert.ok(palette.length >= 2, "ikinci renk de bulunmalı");
  });

  it("merges near-identical shades into one color", () => {
    const pixels = [...px("#2563eb", 200), ...px("#2766ec", 200), ...px("#2461e8", 200)];
    const palette = extractPalette(pixels);
    assert.equal(palette.length, 1);
    assert.ok(Math.abs(palette[0].share - 1) < 0.001);
  });

  it("prefers a vivid minority color over a dominant dull gray when both exist", () => {
    const pixels = [...px("#888888", 500), ...px("#16a34a", 300)];
    const palette = extractPalette(pixels);
    assert.equal(palette.length, 1, "gri elenir (renkli seçenek varken)");
    const g = parseHex(palette[0].hex)!;
    assert.ok(g.g > g.r && g.g > g.b);
  });

  it("keeps grays for a gray-only logo", () => {
    const palette = extractPalette(px("#666666", 400));
    assert.equal(palette.length, 1);
  });

  it("drops colors that cover under 2% of the logo (noise)", () => {
    const pixels = [...px("#16a34a", 990), ...px("#e11d48", 10)];
    assert.equal(extractPalette(pixels).length, 1);
  });

  it("respects maxColors", () => {
    const pixels = [
      ...px("#e11d48", 200),
      ...px("#16a34a", 190),
      ...px("#2563eb", 180),
      ...px("#f59e0b", 170),
      ...px("#7c3aed", 160),
      ...px("#0d9488", 150),
    ];
    assert.equal(extractPalette(pixels, 3).length, 3);
  });
});

describe("suggestBrandColors", () => {
  it("makes every suggestion readable on white and reports adjustments", () => {
    const out = suggestBrandColors([
      { hex: "#fbbf24", share: 0.5, saturation: 0.95 },
      { hex: "#1d4ed8", share: 0.3, saturation: 0.8 },
    ]);
    assert.equal(out.length, 2);
    assert.ok(out.every((s) => s.ratio >= MIN_TEXT_CONTRAST));
    assert.equal(out[0].adjusted, true);
    assert.equal(out[0].original, "#fbbf24");
    assert.equal(out[1].adjusted, false);
  });

  it("collapses colors that become indistinguishable after darkening", () => {
    const out = suggestBrandColors([
      { hex: "#e7216e", share: 0.5, saturation: 0.8 },
      { hex: "#f08ab6", share: 0.3, saturation: 0.7 },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].original, "#e7216e", "en baskın olan kalır");
  });

  it("goes from pixels to suggestions end to end", () => {
    const out = suggestFromPixels([...px("#ffffff", 300), ...px("#fbbf24", 400)]);
    assert.equal(out.length, 1);
    assert.ok(out[0].adjusted && out[0].ratio >= MIN_TEXT_CONTRAST);
  });
});

describe("dark theme background", () => {
  it("matches zinc-950 and shows why a readable-on-white blue is dim on it", () => {
    assert.equal(toHex(DARK_THEME_BG), "#09090b");
    const blue = parseHex("#1d4ed8")!;
    assert.ok(contrastRatio(blue, WHITE) >= MIN_TEXT_CONTRAST);
    assert.ok(contrastRatio(blue, DARK_THEME_BG) < MIN_TEXT_CONTRAST);
  });

  it("keeps saturated extremes (pure yellow/green) hue-stable and above AA on white", () => {
    for (const hex of ["#ffff00", "#00ff00"]) {
      const r = ensureReadableOnWhite(hex)!;
      assert.ok(r.ratio >= MIN_TEXT_CONTRAST, hex);
      assert.ok(Math.abs(rgbToHsl(parseHex(hex)!).h - rgbToHsl(parseHex(r.hex)!).h) < 4, hex);
    }
  });
});
