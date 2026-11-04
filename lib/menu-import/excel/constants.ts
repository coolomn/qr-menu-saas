/** Excel import (.xlsx / .xls) — PDF/görsel pipeline’dan bağımsız. */

export const EXCEL_MAX_FILE_BYTES = 12 * 1024 * 1024;

export const EXCEL_INVALID_MESSAGE =
  "Geçersiz Excel dosyası. Lütfen .xlsx veya .xls yükleyin.";

export const EXCEL_EMPTY_MESSAGE =
  "Excel dosyasından ürün veya kategori tespit edilemedi. Dosyayı kontrol edip tekrar deneyin.";

export const EXCEL_TOO_LARGE_MESSAGE = "Excel dosyası çok büyük (en fazla 12 MB).";

/**
 * Okunacak en fazla satır / sütun / sayfa. Küçük bir dosya "1M satır × 16K sütun" boyut
 * bildirip sunucuyu milyarlarca hücre taramaya zorlayamasın (DoS). Menüler bunun çok altında.
 */
export const EXCEL_MAX_ROWS = 5000;
export const EXCEL_MAX_COLS = 200;
export const EXCEL_MAX_SHEETS = 30;

/** Yatay blokları ayırmak için minimum boş sütun sayısı. */
export const EXCEL_BLOCK_GAP_COLUMNS = 2;

/** Açıklama adayı için minimum karakter (fiyat yoksa). */
export const EXCEL_DESCRIPTION_MIN_CHARS = 28;
