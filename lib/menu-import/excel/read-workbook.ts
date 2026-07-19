import * as XLSX from "xlsx";
import { EXCEL_INVALID_MESSAGE } from "./constants";
import type { ExcelCellValue, ExcelSheetGrid, ExcelWorkbookData } from "./types";

function cellToValue(cell: XLSX.CellObject | undefined): ExcelCellValue {
  if (!cell) return null;
  // Prefer formatted/calculated value
  if (cell.w != null && String(cell.w).trim() !== "") {
    const w = String(cell.w).trim();
    // Keep numeric if t=n
    if (cell.t === "n" && typeof cell.v === "number") return cell.v;
    return w;
  }
  if (cell.v == null) return null;
  if (typeof cell.v === "number" || typeof cell.v === "boolean") return cell.v;
  if (typeof cell.v === "string") return cell.v.trim() || null;
  if (cell.v instanceof Date) return cell.v.toISOString();
  return String(cell.v);
}

function isEmptyValue(v: ExcelCellValue): boolean {
  if (v == null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

function trimGrid(matrix: ExcelCellValue[][]): ExcelCellValue[][] {
  if (matrix.length === 0) return [];

  let maxCol = 0;
  for (const row of matrix) {
    for (let c = row.length - 1; c >= 0; c--) {
      if (!isEmptyValue(row[c])) {
        maxCol = Math.max(maxCol, c + 1);
        break;
      }
    }
  }
  if (maxCol === 0) return [];

  const cropped = matrix.map((row) => {
    const next = row.slice(0, maxCol);
    while (next.length < maxCol) next.push(null);
    return next;
  });

  let start = 0;
  while (start < cropped.length && cropped[start].every(isEmptyValue)) start++;
  let end = cropped.length - 1;
  while (end >= start && cropped[end].every(isEmptyValue)) end--;
  if (start > end) return [];
  return cropped.slice(start, end + 1);
}

function sheetToGrid(sheetName: string, sheet: XLSX.WorkSheet): ExcelSheetGrid | null {
  const ref = sheet["!ref"];
  if (!ref) return null;

  const range = XLSX.utils.decode_range(ref);
  const matrix: ExcelCellValue[][] = [];

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: ExcelCellValue[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      row.push(cellToValue(sheet[addr]));
    }
    matrix.push(row);
  }

  const rows = trimGrid(matrix);
  if (rows.length === 0) return null;

  return {
    sheetName,
    rows,
    rowCount: rows.length,
    colCount: rows[0]?.length ?? 0,
  };
}

export function readExcelWorkbook(buffer: Buffer): ExcelWorkbookData {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellNF: false,
      cellText: true,
      raw: false,
    });
  } catch (e) {
    console.error("[menu-import/excel] workbook read failed:", e instanceof Error ? e.message : e);
    throw new Error(EXCEL_INVALID_MESSAGE);
  }

  if (!workbook.SheetNames?.length) {
    throw new Error(EXCEL_INVALID_MESSAGE);
  }

  const sheets: ExcelSheetGrid[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    // Hidden sheets
    const wbSheet = workbook.Workbook?.Sheets?.find((s) => s.name === name);
    if (wbSheet && (wbSheet.Hidden === 1 || wbSheet.Hidden === 2)) {
      continue;
    }
    try {
      const grid = sheetToGrid(name, sheet);
      if (grid) sheets.push(grid);
    } catch (e) {
      console.error("[menu-import/excel] sheet parse failed:", {
        sheet: name,
        error: e instanceof Error ? e.message : e,
      });
    }
  }

  return { sheets };
}

export function assertExcelMagicOrExtension(buffer: Buffer, fileNameHint?: string): void {
  // ZIP (xlsx) or OLE (xls)
  const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle =
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;
  if (isZip || isOle) return;
  const lower = (fileNameHint || "").toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    // Some exporters omit magic; still try
    return;
  }
  throw new Error(EXCEL_INVALID_MESSAGE);
}
