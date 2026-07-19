import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { readExcelWorkbook, assertExcelMagicOrExtension } from "./read-workbook";
import { analyzeExcelBuffer } from "./analyze-excel";

function buildXlsxBuffer(sheets: Record<string, (string | number | null)[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("excel workbook", () => {
  it("reads multiple sheets and skips empty", async () => {
    const buf = buildXlsxBuffer({
      Drinks: [
        ["Kokteyl", null],
        ["Mojito", "250"],
      ],
      Empty: [[null]],
      More: [
        ["Biralar", null],
        ["Efes", "150"],
      ],
    });
    const wb = readExcelWorkbook(buf);
    assert.ok(wb.sheets.length >= 2);
  });

  it("analyzes dual-block sheet end-to-end", async () => {
    const buf = buildXlsxBuffer({
      Menu: [
        ["Sol Cat", null, null, null, "Sağ Cat", null],
        ["Ürün A", 100, null, null, "Ürün B", 200],
        ["Ürün C", 110, null, null, "Ürün D", 220],
      ],
    });
    const { payload, summary } = await analyzeExcelBuffer(buf, { enableAi: false });
    assert.ok(summary.productCount >= 2);
    assert.ok(payload.categories.length >= 1);
  });

  it("rejects corrupt buffer", () => {
    assert.throws(() => assertExcelMagicOrExtension(Buffer.from("not-excel")), /Excel/);
  });
});
