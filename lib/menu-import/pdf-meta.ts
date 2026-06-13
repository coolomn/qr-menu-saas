import {
  PDF_INVALID_MESSAGE,
  PDF_MAGIC,
  PDF_MAX_PAGES_ASYNC,
  PDF_MAX_PAGES_MESSAGE,
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

export function assertPdfPageCountWithinLimit(
  pageCount: number,
  maxPages: number = PDF_MAX_PAGES_ASYNC
): void {
  if (pageCount < 1) {
    throw new Error(PDF_INVALID_MESSAGE);
  }
  if (pageCount > maxPages) {
    throw new Error(maxPages >= PDF_MAX_PAGES_ASYNC ? PDF_MAX_PAGES_MESSAGE : PDF_INVALID_MESSAGE);
  }
}
