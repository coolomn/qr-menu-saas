/** Excel import (.xlsx / .xls) — PDF/görsel pipeline’dan bağımsız. */

export const EXCEL_MAX_FILE_BYTES = 12 * 1024 * 1024;

export const EXCEL_INVALID_MESSAGE =
  "Geçersiz Excel dosyası. Lütfen .xlsx veya .xls yükleyin.";

export const EXCEL_EMPTY_MESSAGE =
  "Excel dosyasından ürün veya kategori tespit edilemedi. Dosyayı kontrol edip tekrar deneyin.";

export const EXCEL_TOO_LARGE_MESSAGE = "Excel dosyası çok büyük (en fazla 12 MB).";

/** Yatay blokları ayırmak için minimum boş sütun sayısı. */
export const EXCEL_BLOCK_GAP_COLUMNS = 2;

/** Açıklama adayı için minimum karakter (fiyat yoksa). */
export const EXCEL_DESCRIPTION_MIN_CHARS = 28;
