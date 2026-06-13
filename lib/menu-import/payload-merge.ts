import { normalizeCategoryName } from "./category-match";
import {
  enforceProductLimit,
  type ImportCategory,
  type ImportMenuPayload,
} from "./schema";

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Çok sayfalı PDF analiz sonuçlarını birleştirir.
 * - Sayfa sırası korunur
 * - Ardışık aynı kategori adı → ürünler birleştirilir
 * - main_group / i18n: ilk dolu değer korunur
 * - Ürün dedupe yapılmaz
 */
export function mergeImportMenuPayloads(payloads: ImportMenuPayload[]): ImportMenuPayload {
  if (payloads.length === 0) {
    throw new Error("Birleştirilecek menü verisi yok.");
  }
  if (payloads.length === 1) {
    return payloads[0];
  }

  const merged: ImportCategory[] = [];

  for (const payload of payloads) {
    for (const cat of payload.categories) {
      const last = merged[merged.length - 1];
      const sameAsLast =
        last != null && normalizeCategoryName(last.name) === normalizeCategoryName(cat.name);

      if (sameAsLast) {
        last.products.push(...cat.products);
        last.main_group = firstNonEmpty(last.main_group, cat.main_group) ?? last.main_group;
        last.name_en = firstNonEmpty(last.name_en, cat.name_en);
        last.name_ru = firstNonEmpty(last.name_ru, cat.name_ru);
      } else {
        merged.push({
          ...cat,
          products: [...cat.products],
        });
      }
    }
  }

  if (merged.length === 0) {
    throw new Error("Birleştirme sonrası kategori kalmadı.");
  }

  return enforceProductLimit({ categories: merged });
}
