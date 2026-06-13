import {
  PDF_INVALID_MESSAGE,
  PDF_MAGIC,
  PDF_MULTI_PAGE_MESSAGE,
  PDF_MAX_PAGES_V1,
} from "./pdf-constants";
import { loadPdfDocument } from "./pdf-render";

export function assertPdfMagicBytes(buffer: Buffer): void {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== PDF_MAGIC) {
    throw new Error(PDF_INVALID_MESSAGE);
  }
}

export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  assertPdfMagicBytes(buffer);
  const doc = await loadPdfDocument(buffer);
  return doc.numPages;
}

/** Tek sayfalık PDF (Faz PDF-1). */
export async function assertSinglePagePdf(buffer: Buffer): Promise<void> {
  const count = await getPdfPageCount(buffer);
  if (count > PDF_MAX_PAGES_V1) {
    throw new Error(PDF_MULTI_PAGE_MESSAGE);
  }
  if (count < 1) {
    throw new Error(PDF_INVALID_MESSAGE);
  }
}
