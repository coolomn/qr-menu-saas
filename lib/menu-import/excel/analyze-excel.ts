import type { ImportMenuPayload } from "../schema";
import { enforceProductLimit } from "../schema";
import {
  EXCEL_EMPTY_MESSAGE,
  EXCEL_MAX_FILE_BYTES,
  EXCEL_TOO_LARGE_MESSAGE,
} from "./constants";
import { extractCandidatesFromWorkbook } from "./extract";
import { assertExcelMagicOrExtension, readExcelWorkbook } from "./read-workbook";
import { candidatesToImportPayload, summarizeExtraction } from "./to-payload";
import type { ExcelExtractionResult } from "./types";
import { maybeNormalizeAmbiguousWithAi } from "./normalize-ai";

export type AnalyzeExcelResult = {
  payload: ImportMenuPayload;
  summary: ExcelExtractionResult;
};

export async function analyzeExcelBuffer(
  buffer: Buffer,
  options?: { fileNameHint?: string; enableAi?: boolean }
): Promise<AnalyzeExcelResult> {
  if (buffer.length > EXCEL_MAX_FILE_BYTES) {
    throw new Error(EXCEL_TOO_LARGE_MESSAGE);
  }

  assertExcelMagicOrExtension(buffer, options?.fileNameHint);

  const workbook = readExcelWorkbook(buffer);
  if (workbook.sheets.length === 0) {
    throw new Error(EXCEL_EMPTY_MESSAGE);
  }

  console.info("[menu-import/excel] workbook loaded", {
    sheets: workbook.sheets.map((s) => ({
      name: s.sheetName,
      rows: s.rowCount,
      cols: s.colCount,
    })),
  });

  let candidates = extractCandidatesFromWorkbook(workbook.sheets);

  if (options?.enableAi !== false && process.env.OPENAI_API_KEY?.trim()) {
    try {
      candidates = await maybeNormalizeAmbiguousWithAi(candidates);
    } catch (e) {
      console.warn("[menu-import/excel] AI normalize skipped:", e instanceof Error ? e.message : e);
    }
  }

  const summary = summarizeExtraction(candidates, workbook.sheets.length);
  console.info("[menu-import/excel] extraction summary", {
    sheetCount: summary.sheetCount,
    categoryCount: summary.categoryCount,
    productCount: summary.productCount,
    variantCount: summary.variantCount,
    reviewRequiredCount: summary.reviewRequiredCount,
  });

  const payload = enforceProductLimit(candidatesToImportPayload(candidates));
  return { payload, summary };
}
