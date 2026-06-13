import {
  PDF_INVALID_MESSAGE,
  PDF_MAGIC,
  PDF_MULTI_PAGE_MESSAGE,
  PDF_MAX_PAGES_SYNC,
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

export function assertPdfPageCountWithinLimit(pageCount: number): void {
  if (pageCount > PDF_MAX_PAGES_SYNC) {
    throw new Error(PDF_MULTI_PAGE_MESSAGE);
  }
  if (pageCount < 1) {
    throw new Error(PDF_INVALID_MESSAGE);
  }
}
