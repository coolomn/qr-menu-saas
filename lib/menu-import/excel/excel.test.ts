import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExcelPrice, splitNameAndPrice, normalizeTurkishNumber } from "./price";
import { isExcelVariantLabel, formatVariantLabel } from "./variants";
import { detectHorizontalBlocks } from "./blocks";
import { extractCandidatesFromSheet } from "./extract";
import { candidatesToImportPayload } from "./to-payload";
import type { ExcelSheetGrid } from "./types";

describe("excel price", () => {
  it("parses plain and TL prices", () => {
    assert.equal(parseExcelPrice("495")?.amount, "495");
    assert.equal(parseExcelPrice("495 TL")?.amount, "495");
    assert.equal(parseExcelPrice("495,00 TL")?.amount, "495");
    assert.equal(parseExcelPrice("575,- TL")?.amount, "575");
    assert.equal(parseExcelPrice("₺495")?.amount, "495");
  });

  it("parses 1.900 TL as 1900", () => {
    assert.equal(normalizeTurkishNumber("1.900"), "1900");
    assert.equal(parseExcelPrice("1.900 TL")?.amount, "1900");
    assert.equal(parseExcelPrice("1,900")?.amount, "1900");
  });

  it("does not treat measures as prices", () => {
    assert.equal(parseExcelPrice("33 cl"), null);
    assert.equal(parseExcelPrice("50 cl"), null);
    assert.equal(parseExcelPrice("0.7 litre"), null);
    assert.equal(parseExcelPrice("20"), null); // ambiguous measure size without currency
  });

  it("splits name and price in same cell", () => {
    const r = splitNameAndPrice("Aperol White Spritz - 495 TL");
    assert.equal(r.name, "Aperol White Spritz");
    assert.equal(r.price?.amount, "495");
  });
});

describe("excel variants", () => {
  it("recognizes variant labels", () => {
    assert.equal(isExcelVariantLabel("Tek"), true);
    assert.equal(isExcelVariantLabel("Duble"), true);
    assert.equal(isExcelVariantLabel("35’lik"), true);
    assert.equal(isExcelVariantLabel("70 cl"), true);
    assert.equal(isExcelVariantLabel("Şişe"), true);
    assert.equal(formatVariantLabel(35), "35 cl");
  });
});

describe("excel blocks and extract", () => {
  it("splits two horizontal blocks", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "Menu",
      rowCount: 2,
      colCount: 6,
      rows: [
        ["Sol Ürün", 100, null, null, "Sağ Ürün", 200],
        ["Sol 2", 110, null, null, "Sağ 2", 220],
      ],
    };
    const blocks = detectHorizontalBlocks(grid);
    assert.ok(blocks.length >= 2);
  });

  it("binds empty name rows to previous product variants", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "Rakı",
      rowCount: 4,
      colCount: 3,
      rows: [
        ["RAKILAR", null, null],
        ["Yeni Rakı Yeni Seri", "Tek", 290],
        [null, "Duble", 560],
        [null, "35’lik", 1900],
      ],
    };
    const candidates = extractCandidatesFromSheet(grid);
    const payload = candidatesToImportPayload(candidates);
    const product = payload.categories[0]?.products.find((p) =>
      p.name.includes("Yeni Rakı")
    );
    assert.ok(product);
    assert.ok(product!.variants && product!.variants.length >= 2);
  });

  it("attaches description on next line", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "S1",
      rowCount: 3,
      colCount: 2,
      rows: [
        ["Kokteyller", null],
        ["Aperol Spritz", "495 TL"],
        ["Prosecco, Aperol ve soda ile ferah bir kokteyl", null],
      ],
    };
    const candidates = extractCandidatesFromSheet(grid);
    const aperol = candidates.find((c) => c.name.includes("Aperol"));
    assert.ok(aperol);
    assert.ok(aperol!.description && aperol!.description.length > 10);
  });

  it("handles clean columnar excel", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "Clean",
      rowCount: 3,
      colCount: 2,
      rows: [
        ["Kahveler", null],
        ["Espresso", "90"],
        ["Latte", "120"],
      ],
    };
    const payload = candidatesToImportPayload(extractCandidatesFromSheet(grid));
    assert.equal(payload.categories.length, 1);
    assert.equal(payload.categories[0].products.length, 2);
  });

  it("ignores empty sheet content via empty candidates", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "Emptyish",
      rowCount: 1,
      colCount: 1,
      rows: [[null]],
    };
    const candidates = extractCandidatesFromSheet(grid);
    assert.equal(candidates.length, 0);
  });
});
