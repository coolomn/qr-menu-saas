/** menu-imports bucket file_size_limit ile uyumlu (12 MB). */
export const IMPORT_MAX_FILE_BYTES = 12 * 1024 * 1024;

export const PDF_MAGIC = "%PDF-";

export const PDF_INVALID_MESSAGE = "Geçersiz PDF dosyası.";

/** Faz PDF-2: sync analiz üst sınırı. */
export const PDF_MAX_PAGES_SYNC = 3;

/** Faz PDF-3b: async analiz üst sınırı. */
export const PDF_MAX_PAGES_ASYNC = 8;

export const PDF_MAX_PAGES_MESSAGE = "Şimdilik en fazla 8 sayfalık PDF yükleyin.";
