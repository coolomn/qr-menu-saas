import type { PrototypeScenarioId } from "./collections";

/**
 * Çoklu menü koleksiyon akışı (API `menu_collections` / `menu_picker`).
 * Kapatmak: `MULTI_MENU_PROTOTYPE_ENABLED = false` → eski ana grup karşılama ekranı.
 */
export const MULTI_MENU_PROTOTYPE_ENABLED = true;

/** Varsayılan mock restoran senaryosu (URL yoksa). */
export const PROTOTYPE_SCENARIO: PrototypeScenarioId = "A";

export function resolvePrototypeScenario(
  searchParams?: URLSearchParams | null
): PrototypeScenarioId {
  const raw = searchParams?.get("menuScenario")?.toUpperCase();
  if (raw === "A" || raw === "B" || raw === "C") return raw;
  return PROTOTYPE_SCENARIO;
}
