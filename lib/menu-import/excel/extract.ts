import { EXCEL_DESCRIPTION_MIN_CHARS } from "./constants";
import { detectHorizontalBlocks } from "./blocks";
import { parseExcelPrice, splitNameAndPrice } from "./price";
import { formatVariantLabel, isExcelVariantLabel } from "./variants";
import type {
  ExcelCellValue,
  ExcelProductCandidate,
  ExcelSheetGrid,
} from "./types";

function cellText(v: ExcelCellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function isEmptyCell(v: ExcelCellValue): boolean {
  return cellText(v) === "";
}

function looksLikeCategoryHeader(text: string, row: ExcelCellValue[]): boolean {
  if (!text || text.length > 80) return false;
  if (parseExcelPrice(text)) return false;
  if (isExcelVariantLabel(text)) return false;
  // Single non-empty cell in row, or short ALLCAPS / title-ish
  const nonEmpty = row.filter((c) => !isEmptyCell(c));
  if (nonEmpty.length === 1 && !parseExcelPrice(nonEmpty[0])) {
    const t = cellText(nonEmpty[0]);
    if (t.length >= 2 && t.length <= 60 && !/\d{3,}/.test(t)) return true;
  }
  // ALL CAPS Turkish headings
  if (text === text.toLocaleUpperCase("tr-TR") && text.length >= 3 && text.length <= 40) {
    if (!/\d/.test(text) || /CL|ML/i.test(text) === false) {
      if (!parseExcelPrice(text) && !isExcelVariantLabel(text)) return true;
    }
  }
  return false;
}

function looksLikeDescription(text: string): boolean {
  if (!text || text.length < EXCEL_DESCRIPTION_MIN_CHARS) return false;
  if (parseExcelPrice(text) && /^[\d.,\s₺TLtl-]+$/.test(text)) return false;
  if (isExcelVariantLabel(text)) return false;
  return true;
}

type DraftLine = {
  rowIndex: number;
  colIndex: number;
  category: string | null;
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  variant: string | null;
  confidence: number;
  warnings: string[];
};

function extractFromBlock(
  sheetName: string,
  blockRows: ExcelCellValue[][],
  startCol: number
): ExcelProductCandidate[] {
  const drafts: DraftLine[] = [];
  let currentCategory: string | null = null;
  let lastProductName: string | null = null;

  for (let r = 0; r < blockRows.length; r++) {
    const row = blockRows[r];
    const texts = row.map(cellText);
    const nonEmptyIdx = texts
      .map((t, i) => (t ? i : -1))
      .filter((i) => i >= 0);

    if (nonEmptyIdx.length === 0) continue;

    // Category header row (kısa başlık; uzun tek hücre açıklama olabilir)
    if (nonEmptyIdx.length === 1) {
      const only = texts[nonEmptyIdx[0]];
      if (looksLikeDescription(only) && lastProductName) {
        const last = drafts[drafts.length - 1];
        if (last && last.name === lastProductName) {
          last.description = last.description
            ? `${last.description} ${only}`
            : only;
          last.warnings.push("Açıklama alt satırdan birleştirildi");
          continue;
        }
      }
      if (looksLikeCategoryHeader(only, row) && !looksLikeDescription(only)) {
        currentCategory = only;
        continue;
      }
    }

    // Find price cell(s)
    let priceCol = -1;
    let parsedPrice = null as ReturnType<typeof parseExcelPrice>;
    for (let c = row.length - 1; c >= 0; c--) {
      const p = parseExcelPrice(row[c]);
      if (p) {
        priceCol = c;
        parsedPrice = p;
        break;
      }
    }

    // Variant + price pattern (name empty)
    let variantCol = -1;
    for (let c = 0; c < row.length; c++) {
      if (c === priceCol) continue;
      if (isExcelVariantLabel(row[c])) {
        variantCol = c;
        break;
      }
    }

    // Name cell: first non-empty that isn't price/variant
    let nameCol = -1;
    let nameText = "";
    for (let c = 0; c < row.length; c++) {
      if (c === priceCol || c === variantCol) continue;
      const t = texts[c];
      if (!t) continue;
      if (isExcelVariantLabel(t)) continue;
      nameCol = c;
      nameText = t;
      break;
    }

    // Description continuation (no price, long text, has previous product)
    if (!parsedPrice && nameText && looksLikeDescription(nameText) && lastProductName) {
      const last = drafts[drafts.length - 1];
      if (last && last.name === lastProductName) {
        last.description = last.description
          ? `${last.description} ${nameText}`
          : nameText;
        last.warnings.push("Açıklama alt satırdan birleştirildi");
        continue;
      }
    }

    // Name embeds price
    if (nameText && !parsedPrice) {
      const split = splitNameAndPrice(nameText);
      if (split.price && split.name) {
        nameText = split.name;
        parsedPrice = split.price;
      }
    }

    const variantLabel =
      variantCol >= 0 ? formatVariantLabel(row[variantCol]) : null;

    // Empty name + variant → attach to previous product
    if (!nameText && variantLabel && lastProductName) {
      drafts.push({
        rowIndex: r,
        colIndex: startCol + (variantCol >= 0 ? variantCol : 0),
        category: currentCategory,
        name: lastProductName,
        description: null,
        price: parsedPrice?.amount ?? null,
        currency: parsedPrice?.currency ?? null,
        variant: variantLabel,
        confidence: parsedPrice ? 0.85 : 0.55,
        warnings: parsedPrice ? [] : ["Varyant satırında fiyat yok"],
      });
      continue;
    }

    // Category-like without price skip already handled
    if (!nameText) continue;

    // Skip pure category if we mis-detected
    if (!parsedPrice && !variantLabel && looksLikeCategoryHeader(nameText, row)) {
      currentCategory = nameText;
      continue;
    }

    // Description without product name binding
    if (!parsedPrice && !variantLabel && looksLikeDescription(nameText) && lastProductName) {
      const last = drafts[drafts.length - 1];
      if (last) {
        last.description = last.description
          ? `${last.description} ${nameText}`
          : nameText;
        continue;
      }
    }

    const warnings: string[] = [];
    let confidence = 0.9;
    if (!parsedPrice && !variantLabel) {
      confidence = 0.45;
      warnings.push("Fiyat bulunamadı");
    }
    if (!currentCategory) {
      confidence = Math.min(confidence, 0.7);
      warnings.push("Kategori belirsiz");
    }

    lastProductName = nameText;
    drafts.push({
      rowIndex: r,
      colIndex: startCol + (nameCol >= 0 ? nameCol : 0),
      category: currentCategory,
      name: nameText,
      description: null,
      price: parsedPrice?.amount ?? null,
      currency: parsedPrice?.currency ?? null,
      variant: variantLabel,
      confidence,
      warnings,
    });
  }

  return drafts.map((d) => ({
    sourceSheet: sheetName,
    sourceRow: d.rowIndex + 1,
    sourceColumn: d.colIndex + 1,
    category: d.category,
    name: d.name,
    description: d.description,
    price: d.price,
    currency: d.currency,
    variant: d.variant,
    confidence: d.confidence,
    reviewRequired: d.confidence < 0.7 || d.warnings.length > 0,
    warnings: d.warnings,
  }));
}

export function extractCandidatesFromSheet(grid: ExcelSheetGrid): ExcelProductCandidate[] {
  const blocks = detectHorizontalBlocks(grid);
  const out: ExcelProductCandidate[] = [];
  for (const block of blocks) {
    out.push(...extractFromBlock(grid.sheetName, block.rows, block.startCol));
  }
  return out;
}

export function extractCandidatesFromWorkbook(
  sheets: ExcelSheetGrid[]
): ExcelProductCandidate[] {
  const all: ExcelProductCandidate[] = [];
  for (const sheet of sheets) {
    try {
      all.push(...extractCandidatesFromSheet(sheet));
    } catch (e) {
      console.error("[menu-import/excel] extract sheet failed:", {
        sheet: sheet.sheetName,
        error: e instanceof Error ? e.message : e,
      });
    }
  }
  return all;
}
