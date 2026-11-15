import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExcelPrice, splitNameAndPrice, normalizeTurkishNumber } from "./price";
import { isExcelVariantLabel, formatVariantLabel } from "./variants";
import { detectHorizontalBlocks } from "./blocks";
import { extractCandidatesFromSheet } from "./extract";
import { detectHeaderMapping, findHeaderRow, normalizeHeaderCell } from "./headers";
import { candidatesToImportPayload } from "./to-payload";
import type { ExcelSheetGrid } from "./types";

const FORU_HEADER = [
  "Ürün Kodu",
  "Kategori",
  "Ürün Adı",
  "Açıklama",
  "Fiyat (TL)",
  "Boy / Porsiyon",
  "Stok Durumu",
  "Görünürlük",
  "Alerjenler",
];

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

describe("excel headers", () => {
  it("normalizes Turkish header text", () => {
    assert.equal(normalizeHeaderCell("Ürün Adı"), "urun adi");
    assert.equal(normalizeHeaderCell("Fiyat (TL)"), "fiyat tl");
    assert.equal(normalizeHeaderCell("Boy / Porsiyon"), "boy porsiyon");
    assert.equal(normalizeHeaderCell("Açıklama"), "aciklama");
    assert.equal(normalizeHeaderCell(12), "");
  });

  it("maps the FORU header columns", () => {
    const m = detectHeaderMapping(FORU_HEADER);
    assert.ok(m);
    assert.equal(m!.code, 0);
    assert.equal(m!.category, 1);
    assert.equal(m!.name, 2);
    assert.equal(m!.description, 3);
    assert.equal(m!.price, 4);
    assert.equal(m!.variant, 5);
  });

  it("does not treat product rows or lone words as headers", () => {
    assert.equal(detectHeaderMapping(["Espresso", 90]), null);
    assert.equal(detectHeaderMapping(["Kahveler", null]), null);
    // ad sütunu yoksa eşleme güvenilir değil
    assert.equal(detectHeaderMapping(["Kategori", "Fiyat"]), null);
    assert.equal(findHeaderRow([["RAKILAR", null, null], ["Yeni Rakı", "Tek", 290]]), null);
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

  it("reads names from the 'Ürün Adı' column, not the code column", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "QR Menü Test",
      rowCount: 4,
      colCount: 9,
      rows: [
        FORU_HEADER,
        ["FORU-001", "Kahve", "Espresso", "Yoğun aromalı tek shot espresso", 85, "Tek", "Var", "Aktif", "Yok"],
        ["FORU-002", "Kahve", "Double Espresso", "Çift shot espresso", 105, "Çift", "Var", "Aktif", "Yok"],
        ["FORU-011", "Çay", "Demleme Siyah Çay", null, "55", "Bardak", "Var", "Aktif", "Yok"],
      ],
    };
    const candidates = extractCandidatesFromSheet(grid);
    assert.deepEqual(
      candidates.map((c) => c.name),
      ["Espresso", "Double Espresso", "Demleme Siyah Çay"]
    );
    assert.deepEqual(
      candidates.map((c) => c.category),
      ["Kahve", "Kahve", "Çay"]
    );
    assert.deepEqual(
      candidates.map((c) => c.price),
      ["85", "105", "55"]
    );
    assert.equal(candidates[0].description, "Yoğun aromalı tek shot espresso");
    assert.equal(candidates[2].description, null);
    // Başlık satırı ve kod değerleri ürün olmaz
    assert.ok(!candidates.some((c) => /FORU-|Ürün Kodu/.test(c.name)));
    // Tek satırlık üründe "Tek"/"Bardak" varyant olmaz
    assert.ok(candidates.every((c) => c.variant == null));
    assert.ok(candidates.every((c) => !c.reviewRequired));

    const payload = candidatesToImportPayload(candidates);
    assert.equal(payload.categories.length, 2);
    assert.equal(payload.categories[0].products[0].price, "85");
  });

  it("turns repeated product names with size labels into variants", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "S",
      rowCount: 4,
      colCount: 4,
      rows: [
        ["Kategori", "Ürün Adı", "Fiyat", "Boy"],
        ["Kahve", "Latte", 110, "Küçük"],
        ["Kahve", "Latte", 130, "Büyük"],
        ["Kahve", "Filtre Kahve", 90, null],
      ],
    };
    const payload = candidatesToImportPayload(extractCandidatesFromSheet(grid));
    const products = payload.categories[0].products;
    const latte = products.find((p) => p.name === "Latte");
    assert.ok(latte?.variants && latte.variants.length === 2);
    assert.equal(latte!.variants![0].label, "Küçük");
    assert.equal(latte!.variants![1].price, "130");
    assert.equal(products.find((p) => p.name === "Filtre Kahve")?.price, "90");
  });

  it("finds a header below a title row and accepts '50' / 7.5 in the price column", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "S",
      rowCount: 4,
      colCount: 3,
      rows: [
        ["Kafe Menü 2026", null, null],
        ["Ürün Adı", "Kategori", "Fiyat"],
        ["Su", "İçecek", "50"],
        ["Çekirdek", "Atıştırmalık", 7.5],
      ],
    };
    const candidates = extractCandidatesFromSheet(grid);
    assert.deepEqual(
      candidates.map((c) => [c.name, c.price]),
      [
        ["Su", "50"],
        ["Çekirdek", "7.50"],
      ]
    );
  });

  it("flags rows without price or category; blank category continues the previous one", () => {
    const grid: ExcelSheetGrid = {
      sheetName: "S",
      rowCount: 4,
      colCount: 3,
      rows: [
        ["Ürün Adı", "Kategori", "Fiyat"],
        ["Ayran", null, 30],
        ["Çorba", "Başlangıç", null],
        ["Salata", null, 70],
      ],
    };
    const [ayran, corba, salata] = extractCandidatesFromSheet(grid);
    // İlk satırda kategori yok → inceleme gerekir
    assert.equal(ayran.category, null);
    assert.equal(ayran.reviewRequired, true);
    // Fiyatsız → inceleme gerekir
    assert.equal(corba.price, null);
    assert.equal(corba.reviewRequired, true);
    // Boş kategori hücresi (birleştirilmiş hücre) bir öncekini sürdürür
    assert.equal(salata.category, "Başlangıç");
    assert.equal(salata.reviewRequired, false);
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
