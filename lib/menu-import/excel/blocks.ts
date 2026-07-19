import { EXCEL_BLOCK_GAP_COLUMNS } from "./constants";
import type { ExcelCellValue, ExcelSheetGrid } from "./types";

export type ExcelBlock = {
  sheetName: string;
  startCol: number;
  endCol: number;
  rows: ExcelCellValue[][];
};

function colHasContent(rows: ExcelCellValue[][], col: number): boolean {
  for (const row of rows) {
    const v = row[col];
    if (v != null && !(typeof v === "string" && v.trim() === "")) return true;
  }
  return false;
}

/** Boş sütun boşluklarına göre yatay bloklar. */
export function detectHorizontalBlocks(grid: ExcelSheetGrid): ExcelBlock[] {
  const { rows, colCount, sheetName } = grid;
  if (colCount === 0 || rows.length === 0) return [];

  const occupied: boolean[] = [];
  for (let c = 0; c < colCount; c++) {
    occupied[c] = colHasContent(rows, c);
  }

  const blocks: ExcelBlock[] = [];
  let c = 0;
  while (c < colCount) {
    while (c < colCount && !occupied[c]) c++;
    if (c >= colCount) break;
    const start = c;
    let end = c;
    let gap = 0;
    c++;
    while (c < colCount) {
      if (occupied[c]) {
        end = c;
        gap = 0;
        c++;
        continue;
      }
      gap++;
      if (gap >= EXCEL_BLOCK_GAP_COLUMNS) break;
      c++;
    }
    // Include trailing empty cols inside gap that weren't separators? end is last occupied
    const blockRows = rows.map((row) => row.slice(start, end + 1));
    blocks.push({
      sheetName,
      startCol: start,
      endCol: end,
      rows: blockRows,
    });
    // Skip the gap columns
    while (c < colCount && !occupied[c]) c++;
  }

  return blocks.length > 0
    ? blocks
    : [{ sheetName, startCol: 0, endCol: Math.max(0, colCount - 1), rows }];
}
