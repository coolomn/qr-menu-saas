/**
 * Faz 2.5c: müşteri menüsünde yaklaşık döviz karşılığı. Ana fiyat her zaman TL'dir;
 * döviz yalnız "≈ 12 €" bilgisi olarak gösterilir.
 * CURRENCY_CODES, DB'deki public.currency_allowed_codes() ile AYNI olmalıdır.
 */
import { intlLocale, type MenuLanguage } from "@/lib/i18n/languages";

export const CURRENCY_CODES = ["EUR", "USD", "GBP", "RUB", "CHF", "AZN", "SAR", "AED", "CNY", "JPY"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Bir işletmenin seçebileceği en fazla döviz (DB kısıtıyla aynı). */
export const MAX_DISPLAY_CURRENCIES = 5;

/** Son başarılı kur çekiminden bu kadar saat sonra günlük kur gösterilmez (cron bozulursa eski kur kalmasın). */
export const RATE_MAX_AGE_HOURS = 72;

/**
 * TCMB bülten tarihi bundan eskiyse de gösterilmez (cron çalışsa bile TCMB eski bülten döndürürse).
 * Uzun bayram tatillerinde (≈9 gün) kur değişmediği için sınır 10 gün.
 */
export const RATE_MAX_BULLETIN_AGE_DAYS = 10;

export const CURRENCY_INFO: Record<CurrencyCode, { symbol: string; turkishName: string }> = {
  EUR: { symbol: "€", turkishName: "Euro" },
  USD: { symbol: "$", turkishName: "ABD doları" },
  GBP: { symbol: "£", turkishName: "İngiliz sterlini" },
  RUB: { symbol: "₽", turkishName: "Rus rublesi" },
  CHF: { symbol: "CHF", turkishName: "İsviçre frangı" },
  AZN: { symbol: "₼", turkishName: "Azerbaycan manatı" },
  SAR: { symbol: "SAR", turkishName: "Suudi riyali" },
  AED: { symbol: "AED", turkishName: "BAE dirhemi" },
  CNY: { symbol: "¥", turkishName: "Çin yuanı" },
  JPY: { symbol: "¥", turkishName: "Japon yeni" },
};

const CODE_SET = new Set<string>(CURRENCY_CODES);

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && CODE_SET.has(value);
}

/** DB'den gelen display_currencies → güvenli liste (bilinmeyen/yinelenen atılır, en fazla 5). */
export function normalizeDisplayCurrencies(raw: unknown): CurrencyCode[] {
  if (!Array.isArray(raw)) return [];
  const out: CurrencyCode[] = [];
  for (const value of raw) {
    if (isCurrencyCode(value) && !out.includes(value)) out.push(value);
    if (out.length >= MAX_DISPLAY_CURRENCIES) break;
  }
  return out;
}

/** DB'den gelen fixed_exchange_rates → yalnız geçerli (0 < kur < 100000) değerler. */
export function normalizeFixedRates(raw: unknown): Partial<Record<CurrencyCode, number>> {
  const out: Partial<Record<CurrencyCode, number>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCurrencyCode(key)) continue;
    const n = typeof value === "number" ? value : Number.NaN;
    if (Number.isFinite(n) && n > 0 && n < 100000) out[key] = n;
  }
  return out;
}

/** Müşteri menüsüne giden döviz bilgisi (1 birim döviz = tryPerUnit TL). */
export type PublicCurrencyRate = {
  code: CurrencyCode;
  try_per_unit: number;
  /** true: işletmenin sabit kuru; false: günlük TCMB kuru. */
  fixed: boolean;
  /** Günlük kurda TCMB bülten tarihi (YYYY-MM-DD); sabit kurda null. */
  rate_date: string | null;
};

export type ExchangeRateRow = {
  currency: string;
  try_per_unit: number | string;
  rate_date: string;
  fetched_at: string;
};

/**
 * İşletmenin seçtiği dövizler için gösterilebilecek kurlar (sırası korunur).
 * Sabit kur varsa o; yoksa son 72 saatte çekilmiş günlük kur; ikisi de yoksa o döviz gösterilmez.
 */
export function resolvePublicCurrencyRates(args: {
  displayCurrencies: CurrencyCode[];
  fixedRates: Partial<Record<CurrencyCode, number>>;
  liveRates: ExchangeRateRow[];
  now?: Date;
}): PublicCurrencyRate[] {
  const now = (args.now ?? new Date()).getTime();
  const live = new Map<string, ExchangeRateRow>();
  for (const row of args.liveRates) live.set(row.currency, row);

  const out: PublicCurrencyRate[] = [];
  for (const code of args.displayCurrencies) {
    const fixed = args.fixedRates[code];
    if (fixed !== undefined) {
      out.push({ code, try_per_unit: fixed, fixed: true, rate_date: null });
      continue;
    }
    const row = live.get(code);
    if (!row) continue;
    const rate = typeof row.try_per_unit === "number" ? row.try_per_unit : Number.parseFloat(row.try_per_unit);
    const fetchedAt = Date.parse(row.fetched_at);
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(fetchedAt)) continue;
    if (now - fetchedAt > RATE_MAX_AGE_HOURS * 3600 * 1000) continue;
    const bulletin = Date.parse(`${row.rate_date}T00:00:00Z`);
    if (!Number.isFinite(bulletin) || now - bulletin > RATE_MAX_BULLETIN_AGE_DAYS * 86400 * 1000) continue;
    out.push({ code, try_per_unit: rate, fixed: false, rate_date: row.rate_date });
  }
  return out;
}

/** Menüye gelen currency_rates alanını doğrular (eski önbellek / bozuk veri). */
export function normalizePublicCurrencyRates(raw: unknown): PublicCurrencyRate[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicCurrencyRate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!isCurrencyCode(r.code) || out.some((x) => x.code === r.code)) continue;
    const rate = typeof r.try_per_unit === "number" ? r.try_per_unit : Number.NaN;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    out.push({
      code: r.code,
      try_per_unit: rate,
      fixed: r.fixed === true,
      rate_date: typeof r.rate_date === "string" ? r.rate_date : null,
    });
  }
  return out;
}

/** Dil → o dili konuşan misafirin büyük ihtimalle kullandığı döviz (yalnız işletme açtıysa seçilir). */
const LANGUAGE_CURRENCY: Partial<Record<MenuLanguage, CurrencyCode>> = {
  ru: "RUB",
  de: "EUR",
  fr: "EUR",
  es: "EUR",
  it: "EUR",
  az: "AZN",
  zh: "CNY",
};

/**
 * Müşterinin ilk göreceği döviz: daha önce seçtiği (TRY = kapalı dahil) > menü diline uygun döviz >
 * Türkçe dışı dillerde işletmenin ilk dövizi > kapalı (null). Türkçe menüde varsayılan kapalıdır.
 */
export function pickInitialCurrency(
  available: CurrencyCode[],
  opts: { stored: string | null; language: MenuLanguage }
): CurrencyCode | null {
  if (available.length === 0) return null;
  if (opts.stored === "TRY") return null;
  if (isCurrencyCode(opts.stored) && available.includes(opts.stored)) return opts.stored;
  if (opts.language === "tr") return null;
  const byLanguage = LANGUAGE_CURRENCY[opts.language];
  if (byLanguage && available.includes(byLanguage)) return byLanguage;
  return available[0] ?? null;
}

/** TL tutarı → dövize çevrilmiş tutar. */
export function convertFromTry(amountTry: number, rate: PublicCurrencyRate): number {
  return amountTry / rate.try_per_unit;
}

/**
 * Yaklaşık tutar biçimi (dile göre): 10 ve üstü tam sayı, altı 2 ondalık. JPY/RUB küsuratsız.
 * Ör. tr → "€12", de → "12 €".
 */
export function formatApproxAmount(amount: number, code: CurrencyCode, language: string): string {
  const abs = Math.abs(amount);
  const noDecimals = code === "JPY" || code === "RUB" || abs >= 10;
  try {
    return new Intl.NumberFormat(intlLocale(language), {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: noDecimals ? 0 : 2,
      maximumFractionDigits: noDecimals ? 0 : 2,
    }).format(amount);
  } catch {
    const rounded = noDecimals ? Math.round(amount).toString() : amount.toFixed(2);
    return `${rounded} ${CURRENCY_INFO[code].symbol}`;
  }
}
