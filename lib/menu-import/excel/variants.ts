const VARIANT_EXACT = new Set(
  [
    "tek",
    "duble",
    "şişe",
    "sise",
    "kadeh",
    "küçük",
    "kucuk",
    "orta",
    "büyük",
    "buyuk",
    "small",
    "medium",
    "large",
  ].map((s) => s.toLocaleLowerCase("tr-TR"))
);

const VARIANT_MEASURE =
  /^\s*\d+([.,]\d+)?\s*(cl|ml|lt|l|’lik|'lik|lik)\s*$/i;

const VARIANT_LIK =
  /^\s*\d+\s*[’']?\s*lik\s*$/i;

export function normalizeVariantLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function isExcelVariantLabel(raw: unknown): boolean {
  if (typeof raw === "number") {
    // 20/33/35/50/70 tek başına varyant adayı olabilir (cl sütunu ayrı)
    return [20, 33, 35, 50, 70].includes(raw);
  }
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (!t) return false;
  const lower = t.toLocaleLowerCase("tr-TR");
  if (VARIANT_EXACT.has(lower)) return true;
  if (VARIANT_MEASURE.test(t)) return true;
  if (VARIANT_LIK.test(t)) return true;
  // "35’lik" / "35'lik"
  if (/^\d+\s*[’']lik$/i.test(t.replace(/\s/g, ""))) return true;
  return false;
}

export function formatVariantLabel(raw: unknown): string | null {
  if (!isExcelVariantLabel(raw)) return null;
  if (typeof raw === "number") return `${raw} cl`;
  return normalizeVariantLabel(String(raw));
}
