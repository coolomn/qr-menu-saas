/**
 * Faz 2.5c: TL fiyat metni → "≈ €12" metni. Fiyat metni net bir sayı değilse ("120-150", "Sorunuz")
 * yaklaşık tutar gösterilmez — yanlış dönüşüm göstermektense hiç göstermemek daha iyi.
 */
import { parsePriceNumber } from "@/lib/public-menu/menu-filters";
import { intlLocale } from "@/lib/i18n/languages";
import { convertFromTry, formatApproxAmount, type PublicCurrencyRate } from "./currencies";

const TRY_MARKS = /₺|\bTL\b|\bTRY\b/gi;

/** "120", "1.250,50 ₺", "TL 99.90", "+15" → sayı; belirsiz metinde null. */
export function parseTryAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = (raw ?? "").replace(TRY_MARKS, "").replace(/\s+/g, "");
  if (!/^[+\-−]?\d[\d.,]*$/.test(s)) return null;
  const n = parsePriceNumber(s);
  if (n === null) return null;
  return /^[-−]/.test(s) ? -n : n;
}

/** "≈ €12" ya da (işaretli) "≈ +€0.30"; sıfır/belirsizde null. */
export function approxText(
  raw: string | number | null | undefined,
  rate: PublicCurrencyRate,
  language: string,
  opts: { signed?: boolean } = {}
): string | null {
  const tl = parseTryAmount(raw);
  if (tl === null || tl === 0) return null;
  const converted = convertFromTry(Math.abs(tl), rate);
  // "≈ €0.00" gibi anlamsız küçük tutarlar gösterilmez.
  if (converted < 0.01) return null;
  const formatted = formatApproxAmount(converted, rate.code, language);
  const sign = opts.signed ? (tl < 0 ? "−" : "+") : tl < 0 ? "−" : "";
  return `≈ ${sign}${formatted}`;
}

/** "1 € = 55,60 ₺" (sayı biçimi menü diline göre). */
export function rateLabel(rate: PublicCurrencyRate, language: string): string {
  const one = formatApproxAmount(1, rate.code, language).replace(/[.,]00(?=\D*$)/, "");
  const tl = new Intl.NumberFormat(intlLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: rate.try_per_unit < 1 ? 4 : 2,
  }).format(rate.try_per_unit);
  return `${one} = ${tl} ₺`;
}
