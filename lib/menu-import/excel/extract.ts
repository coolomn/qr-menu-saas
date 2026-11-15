import { EXCEL_DESCRIPTION_MIN_CHARS } from "./constants";
import { detectHorizontalBlocks } from "./blocks";
import { findHeaderRow, type ExcelHeaderMapping } from "./headers";
import {
  normalizeTurkishNumber,
  parseExcelPrice,
  splitNameAndPrice,
  type ParsedExcelPrice,
} from "./price";
import {
  formatVariantLabel,
  isExcelVariantLabel,
  normalizeVariantLabel,
} from "./variants";
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

/**
 * Açık "Fiyat" sütunundaki değer fiyattır: "50" gibi ölçü sanılan metinler ve
 * 7.5 gibi küçük ondalıklar da kabul edilir (başlıksız sezgisel yöntem bunları reddeder).
 */
function parseHeaderPrice(v: ExcelCellValue): ParsedExcelPrice | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0 || v > 1_000_000) return null;
    const amount = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.00$/, "");
    return { amount, currency: null, raw: String(v) };
  }
  const text = cellText(v);
  if (!text) return null;
  const parsed = parseExcelPrice(text);
  if (parsed) return parsed;
  const cleaned = text.replace(/[^\d.,]/g, "");
  const amount = cleaned ? normalizeTurkishNumber(cleaned) : null;
  return amount && Number(amount) > 0
    ? { amount, currency: null, raw: text }
    : null;
}

type HeaderDraft = {
  rowIndex: number;
  category: string | null;
  name: string;
  description: string | null;
  price: ParsedExcelPrice | null;
  variantText: string;
};

/**
 * Başlık satırı olan blok: sütunlar başlığa göre okunur (ad, kategori, açıklama,
 * fiyat, boy/porsiyon). Kod, stok, görünürlük, alerjen gibi sütunlar yok sayılır.
 * Boy/Porsiyon etiketi yalnızca aynı ürün adı birden fazla satırda geçiyorsa
 * varyant olur; tek satırlık üründe ("Tek", "Bardak"...) düz fiyat olarak kalır.
 */
function extractWithHeader(
  sheetName: string,
  rows: ExcelCellValue[][],
  startCol: number,
  headerRowIndex: number,
  m: ExcelHeaderMapping
): ExcelProductCandidate[] {
  const drafts: HeaderDraft[] = [];
  let currentCategory: string | null = null;
  let lastName: string | null = null;

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every(isEmptyCell)) continue;

    const at = (col: number) => (col >= 0 ? cellText(row[col]) : "");

    const category = at(m.category);
    if (category) currentCategory = category;

    const variantText = at(m.variant);
    let name = at(m.name);
    if (!name) {
      // Ad boş + varyant dolu → önceki ürünün ek satırı
      if (variantText && lastName) name = lastName;
      else continue;
    }
    lastName = name;

    drafts.push({
      rowIndex: r,
      category: currentCategory,
      name,
      description: at(m.description) || null,
      price: m.price >= 0 ? parseHeaderPrice(row[m.price]) : null,
      variantText,
    });
  }

  const rowsPerProduct = new Map<string, number>();
  for (const d of drafts) {
    const key = `${d.category ?? ""}::${d.name}`;
    rowsPerProduct.set(key, (rowsPerProduct.get(key) ?? 0) + 1);
  }

  return drafts.map((d) => {
    const multiRow = (rowsPerProduct.get(`${d.category ?? ""}::${d.name}`) ?? 0) > 1;
    const variant =
      multiRow && d.variantText ? normalizeVariantLabel(d.variantText) : null;

    const warnings: string[] = [];
    let confidence = 0.95;
    if (!d.price) {
      confidence = 0.45;
      warnings.push("Fiyat bulunamadı");
    }
    if (!d.category) {
      confidence = Math.min(confidence, 0.7);
      warnings.push("Kategori belirsiz");
    }

    return {
      sourceSheet: sheetName,
      sourceRow: d.rowIndex + 1,
      sourceColumn: startCol + m.name + 1,
      category: d.category,
      name: d.name,
      description: d.description,
      price: d.price?.amount ?? null,
      currency: d.price?.currency ?? null,
      variant,
      confidence,
      reviewRequired: confidence < 0.7 || warnings.length > 0,
      warnings,
    };
  });
}

type SheetExtraction = {
  candidates: ExcelProductCandidate[];
  /** En az bir blokta başlık satırı bulundu. */
  headerMode: boolean;
};

function extractSheet(grid: ExcelSheetGrid): SheetExtraction {
  const blocks = detectHorizontalBlocks(grid);
  const candidates: ExcelProductCandidate[] = [];
  let headerMode = false;
  for (const block of blocks) {
    const header = findHeaderRow(block.rows);
    if (header) {
      headerMode = true;
      candidates.push(
        ...extractWithHeader(
          grid.sheetName,
          block.rows,
          block.startCol,
          header.rowIndex,
          header.mapping
        )
      );
    } else {
      candidates.push(
        ...extractFromBlock(grid.sheetName, block.rows, block.startCol)
      );
    }
  }
  return { candidates, headerMode };
}

export function extractCandidatesFromSheet(grid: ExcelSheetGrid): ExcelProductCandidate[] {
  return extractSheet(grid).candidates;
}

export function extractCandidatesFromWorkbook(
  sheets: ExcelSheetGrid[]
): ExcelProductCandidate[] {
  const results: SheetExtraction[] = [];
  for (const sheet of sheets) {
    try {
      results.push(extractSheet(sheet));
    } catch (e) {
      console.error("[menu-import/excel] extract sheet failed:", {
        sheet: sheet.sheetName,
        error: e instanceof Error ? e.message : e,
      });
    }
  }

  // Başlıklı bir ürün tablosu varsa, başlıksız sayfalardaki fiyatsız/varyantsız
  // satırlar (ör. "Kullanım Notları" sayfası) ürün sayılmaz.
  const hasHeaderSheet = results.some((r) => r.headerMode);
  const all: ExcelProductCandidate[] = [];
  for (const r of results) {
    if (hasHeaderSheet && !r.headerMode) {
      all.push(...r.candidates.filter((c) => c.price != null || c.variant != null));
    } else {
      all.push(...r.candidates);
    }
  }
  return all;
}
