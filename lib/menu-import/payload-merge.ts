import type { ImportMenuPayload } from "./schema";

/**
 * Çok sayfalı PDF analiz sonuçlarını birleştirir.
 * Faz PDF-1: tek payload passthrough.
 */
export function mergeImportMenuPayloads(payloads: ImportMenuPayload[]): ImportMenuPayload {
  if (payloads.length === 0) {
    throw new Error("Birleştirilecek menü verisi yok.");
  }
  if (payloads.length === 1) {
    return payloads[0];
  }
  throw new Error("Çok sayfalı menü birleştirme henüz desteklenmiyor.");
}
