import type { ExcelCellValue } from "./types";

/**
 * Başlık satırı (ör. "Ürün Kodu | Kategori | Ürün Adı | Fiyat") algılama.
 * Başlık bulunursa sütunlar indekse göre okunur; bulunmazsa çağıran taraf
 * eski sezgisel (başlıksız) yönteme düşer.
 */

export type ExcelHeaderRole =
  | "name"
  | "code"
  | "category"
  | "description"
  | "price"
  | "variant";

export type ExcelHeaderMapping = {
  /** Sütun indeksi (blok içi); bulunamadıysa -1. */
  name: number;
  code: number;
  category: number;
  description: number;
  price: number;
  variant: number;
};

/** Başlık satırı ilk kaç dolu satır içinde aranır (üstte başlık/başlık yazısı olabilir). */
const HEADER_SEARCH_ROWS = 5;

const NAME = new Set([
  "urun adi",
  "urun ismi",
  "urun",
  "adi",
  "ad",
  "isim",
  "name",
  "product",
  "product name",
]);
const CODE = new Set([
  "urun kodu",
  "stok kodu",
  "kod",
  "sku",
  "code",
  "barkod",
  "urun no",
]);
const CATEGORY = new Set(["kategori", "category", "grup", "bolum"]);
const DESCRIPTION = new Set(["aciklama", "description", "icerik"]);
const PRICE = new Set(["price", "ucret", "tutar"]);
const VARIANT = new Set(["porsiyon", "size", "boyut"]);

/** "Ürün Adı", "Fiyat (TL)", "Boy / Porsiyon" → "urun adi", "fiyat tl", "boy porsiyon". */
export function normalizeHeaderCell(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function headerRoleOf(raw: unknown): ExcelHeaderRole | null {
  const h = normalizeHeaderCell(raw);
  if (!h) return null;
  if (CODE.has(h)) return "code";
  if (NAME.has(h)) return "name";
  if (CATEGORY.has(h)) return "category";
  if (DESCRIPTION.has(h)) return "description";
  if (PRICE.has(h) || h === "fiyat" || h.startsWith("fiyat ")) return "price";
  if (VARIANT.has(h) || h === "boy" || h.startsWith("boy ")) return "variant";
  return null;
}

/**
 * Satır başlık satırı mı? En az 2 farklı rol eşleşmeli ve "ad" sütunu olmalı
 * (ad sütunu olmadan sütun eşlemesi güvenilir değil).
 */
export function detectHeaderMapping(row: ExcelCellValue[]): ExcelHeaderMapping | null {
  const mapping: ExcelHeaderMapping = {
    name: -1,
    code: -1,
    category: -1,
    description: -1,
    price: -1,
    variant: -1,
  };
  let roles = 0;
  for (let c = 0; c < row.length; c++) {
    const role = headerRoleOf(row[c]);
    if (!role || mapping[role] !== -1) continue;
    mapping[role] = c;
    roles++;
  }
  if (mapping.name === -1 || roles < 2) return null;
  return mapping;
}

/** İlk dolu satırlar içinde başlık satırını arar. */
export function findHeaderRow(
  rows: ExcelCellValue[][]
): { rowIndex: number; mapping: ExcelHeaderMapping } | null {
  let seen = 0;
  for (let r = 0; r < rows.length && seen < HEADER_SEARCH_ROWS; r++) {
    const row = rows[r];
    const hasContent = row.some(
      (c) => c != null && !(typeof c === "string" && c.trim() === "")
    );
    if (!hasContent) continue;
    seen++;
    const mapping = detectHeaderMapping(row);
    if (mapping) return { rowIndex: r, mapping };
  }
  return null;
}
