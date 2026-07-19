export type ExcelCellValue = string | number | boolean | null;

export type ExcelSheetGrid = {
  sheetName: string;
  /** row-major; trimmed empty trailing rows/cols removed */
  rows: ExcelCellValue[][];
  rowCount: number;
  colCount: number;
};

export type ExcelWorkbookData = {
  sheets: ExcelSheetGrid[];
};

/**
 * Ham Excel çıkarma adayı.
 * Not: Mevcut product_variants modeli ImportVariant[] ile uyumlu;
 * migration yok — varyantlar ImportProduct.variants’a map edilir.
 */
export type ExcelProductCandidate = {
  sourceSheet: string;
  sourceRow: number;
  sourceColumn: number;
  category: string | null;
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  variant: string | null;
  confidence: number;
  reviewRequired: boolean;
  warnings: string[];
};

export type ExcelExtractionResult = {
  candidates: ExcelProductCandidate[];
  sheetCount: number;
  categoryCount: number;
  productCount: number;
  variantCount: number;
  reviewRequiredCount: number;
};
