export function isPdfMime(mime: string) {
  return mime === "application/pdf" || mime === "application/x-pdf";
}

export function isImageMime(mime: string) {
  return (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif"
  );
}

/** .xlsx / .xls MIME (tarayıcı ve OS varyasyonları). */
export function isExcelMime(mime: string) {
  const m = mime.trim().toLowerCase();
  return (
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    m === "application/vnd.ms-excel" ||
    m === "application/excel" ||
    m === "application/x-excel" ||
    m === "application/x-msexcel"
  );
}

export function isExcelFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  return lower.endsWith(".xlsx") || lower.endsWith(".xls");
}
