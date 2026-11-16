/**
 * TCMB günlük kur bülteni (https://www.tcmb.gov.tr/kurlar/today.xml).
 * Döviz satış (ForexSelling) / Unit = 1 birim döviz kaç TL. JPY 100 birim üzerinden gelir.
 * Bülten iş günleri 15:30 civarı yayımlanır; hafta sonu son iş gününün bülteni döner.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRENCY_CODES, type CurrencyCode } from "./currencies";

export const TCMB_TODAY_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

export type ParsedTcmbRates = {
  /** Bülten tarihi YYYY-MM-DD. */
  rateDate: string;
  rates: Partial<Record<CurrencyCode, number>>;
};

function tagValue(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`));
  return m ? m[1] : null;
}

/** XML → kurlar. Tarih ya da hiç kur bulunamazsa null (bozuk/değişmiş yanıt). */
export function parseTcmbXml(xml: string): ParsedTcmbRates | null {
  const dateMatch = xml.match(/<Tarih_Date[^>]*\bDate="(\d{2})\/(\d{2})\/(\d{4})"/);
  if (!dateMatch) return null;
  const [, month, day, year] = dateMatch;
  const rateDate = `${year}-${month}-${day}`;
  if (Number.isNaN(Date.parse(`${rateDate}T00:00:00Z`))) return null;

  const wanted = new Set<string>(CURRENCY_CODES);
  const rates: Partial<Record<CurrencyCode, number>> = {};
  const blocks = xml.match(/<Currency\b[^>]*>[\s\S]*?<\/Currency>/g) ?? [];
  for (const block of blocks) {
    const code = block.match(/\bCurrencyCode="([A-Z]{3})"/)?.[1];
    if (!code || !wanted.has(code)) continue;
    const unit = Number.parseInt(tagValue(block, "Unit") ?? "", 10);
    const selling = Number.parseFloat(tagValue(block, "ForexSelling") ?? "");
    if (!Number.isFinite(unit) || unit <= 0 || !Number.isFinite(selling) || selling <= 0) continue;
    const perUnit = selling / unit;
    if (perUnit > 0 && perUnit < 100000) rates[code as CurrencyCode] = Number(perUnit.toFixed(6));
  }
  if (Object.keys(rates).length === 0) return null;
  return { rateDate, rates };
}

export type RefreshRatesResult = { updated: number; rateDate: string };

/**
 * TCMB'den çekip exchange_rates'e yazar. Hata olursa throw eder; tablodaki eski kurlar kalır
 * (72 saat sonra müşteri menüsünde gizlenir).
 */
export async function refreshExchangeRates(
  admin: SupabaseClient,
  opts: { fetchImpl?: typeof fetch; now?: Date } = {}
): Promise<RefreshRatesResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(TCMB_TODAY_URL, {
    headers: { Accept: "application/xml,text/xml" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TCMB yanıtı ${res.status}`);
  const parsed = parseTcmbXml(await res.text());
  if (!parsed) throw new Error("TCMB yanıtı okunamadı");

  const fetchedAt = (opts.now ?? new Date()).toISOString();
  const rows = Object.entries(parsed.rates).map(([currency, rate]) => ({
    currency,
    try_per_unit: rate,
    rate_date: parsed.rateDate,
    source: "tcmb",
    fetched_at: fetchedAt,
  }));
  const { error } = await admin.from("exchange_rates").upsert(rows, { onConflict: "currency" });
  if (error) throw new Error(`kurlar yazılamadı: ${error.message}`);
  return { updated: rows.length, rateDate: parsed.rateDate };
}
