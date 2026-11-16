"use client";

import { useEffect, useMemo, useState } from "react";
import { Coins } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  CURRENCY_CODES,
  CURRENCY_INFO,
  MAX_DISPLAY_CURRENCIES,
  RATE_MAX_AGE_HOURS,
  type CurrencyCode,
  type ExchangeRateRow,
} from "@/lib/currency/currencies";

const supabase = getBrowserSupabase();

type Props = {
  restaurantId: string;
  displayCurrencies: CurrencyCode[];
  fixedRates: Partial<Record<CurrencyCode, number>>;
  onSaved: (next: { display_currencies: CurrencyCode[]; fixed_exchange_rates: Partial<Record<CurrencyCode, number>> }) => void;
};

const trNumber = (n: number, max = 4) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: max }).format(n);

/** "50", "50,5", "1.050,25" → sayı; boş → null; geçersiz → NaN. */
function parseRateInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;
  if (!/^\d[\d.,]*$/.test(s)) return Number.NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

/** Faz 2.5c: müşteri menüsünde "≈ 12 €" gösterilecek dövizler + isteğe bağlı sabit kur. */
export function CurrencyCard({ restaurantId, displayCurrencies, fixedRates, onSaved }: Props) {
  const [selected, setSelected] = useState<Set<CurrencyCode>>(() => new Set(displayCurrencies));
  const [fixedInputs, setFixedInputs] = useState<Partial<Record<CurrencyCode, string>>>(() =>
    // Ham değer (yuvarlamadan): başka bir döviz kaydedilirken sabit kur sessizce değişmesin.
    Object.fromEntries(Object.entries(fixedRates).map(([k, v]) => [k, String(v).replace(".", ",")]))
  );
  // Yalnız son 72 saatte çekilmiş (müşteri menüsünde gösterilebilir) günlük kurlar.
  const [liveRates, setLiveRates] = useState<Map<string, ExchangeRateRow>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("exchange_rates")
      .select("currency,try_per_unit,rate_date,fetched_at")
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const now = Date.now();
        const fresh = ((data ?? []) as ExchangeRateRow[]).filter(
          (r) => now - Date.parse(r.fetched_at) <= RATE_MAX_AGE_HOURS * 3600 * 1000
        );
        setLiveRates(new Map(fresh.map((r) => [r.currency, r])));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ordered = CURRENCY_CODES.filter((c) => selected.has(c));

  const parsedFixed = useMemo(() => {
    const out: Partial<Record<CurrencyCode, number>> = {};
    const invalid: CurrencyCode[] = [];
    for (const code of ordered) {
      const n = parseRateInput(fixedInputs[code] ?? "");
      if (n === null) continue;
      if (!Number.isFinite(n) || n <= 0 || n >= 100000) invalid.push(code);
      else out[code] = Number(n.toFixed(6));
    }
    return { out, invalid };
  }, [ordered, fixedInputs]);

  const dirty =
    ordered.join(",") !== CURRENCY_CODES.filter((c) => displayCurrencies.includes(c)).join(",") ||
    JSON.stringify(parsedFixed.out) !==
      JSON.stringify(
        Object.fromEntries(CURRENCY_CODES.filter((c) => fixedRates[c] !== undefined && displayCurrencies.includes(c)).map((c) => [c, fixedRates[c]]))
      );

  const toggle = (code: CurrencyCode) => {
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else if (next.size < MAX_DISPLAY_CURRENCIES) next.add(code);
      return next;
    });
  };

  const save = async () => {
    if (parsedFixed.invalid.length > 0) {
      setMessage({ ok: false, text: `Geçersiz sabit kur: ${parsedFixed.invalid.join(", ")}. Örnek: 50 ya da 50,25` });
      return;
    }
    setBusy(true);
    setMessage(null);
    const payload = { display_currencies: ordered, fixed_exchange_rates: parsedFixed.out };
    const { error } = await supabase.from("restaurants").update(payload).eq("id", restaurantId);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: `Kaydedilemedi: ${error.message || "bilinmeyen hata"}` });
      return;
    }
    onSaved(payload);
    setMessage({
      ok: true,
      text: ordered.length
        ? "Kaydedildi. Müşteri menüsünde döviz seçici açıldı."
        : "Kaydedildi. Müşteri menüsünde döviz gösterimi kapalı.",
    });
  };

  return (
    <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Coins size={22} aria-hidden /> Para birimleri
        </h2>
        <p className="mt-1 text-xs font-medium text-gray-500 leading-snug">
          Fiyatlar TL kalır; seçtiğiniz dövizlerde misafir fiyatın yanında yaklaşık karşılığını görür (ör. ≈ €12).
          Kur her sabah TCMB&apos;den otomatik güncellenir. İsterseniz kendi sabit kurunuzu yazın. En fazla{" "}
          {MAX_DISPLAY_CURRENCIES} döviz.
        </p>
      </div>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {CURRENCY_CODES.map((code) => {
          const on = selected.has(code);
          const live = liveRates.get(code);
          const liveRate = live ? Number(live.try_per_unit) : null;
          const liveStale = !live;
          const disabled = !on && selected.size >= MAX_DISPLAY_CURRENCIES;
          const symbol = CURRENCY_INFO[code].symbol;
          return (
            <li
              key={code}
              className={`rounded-2xl border-2 px-3 py-2.5 ${on ? "border-blue-200 bg-white" : "border-gray-100 bg-gray-50/60"}`}
            >
              <label className={`flex items-center gap-3 min-h-8 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => toggle(code)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-black text-gray-900">
                  {code} <span className="font-bold text-gray-500">{symbol !== code ? symbol : ""}</span>
                </span>
                <span className="text-[11px] font-bold text-gray-500">{CURRENCY_INFO[code].turkishName}</span>
                <span className="ml-auto text-[11px] font-bold text-gray-500 text-right">
                  {liveRate && !liveStale
                    ? `${trNumber(liveRate)} ₺ · TCMB ${formatDate(live!.rate_date)}`
                    : "Günlük kur yok"}
                </span>
              </label>
              {on && (
                <div className="mt-2 flex items-center gap-2 pl-7">
                  <label className="text-[11px] font-bold text-gray-600" htmlFor={`fixed-rate-${code}`}>
                    Sabit kur (1 {code} =)
                  </label>
                  <input
                    id={`fixed-rate-${code}`}
                    inputMode="decimal"
                    placeholder={liveRate && !liveStale ? `boş = günlük (${trNumber(liveRate, 2)})` : "günlük kur yok — kur yazın"}
                    value={fixedInputs[code] ?? ""}
                    onChange={(e) => {
                      setMessage(null);
                      setFixedInputs((prev) => ({ ...prev, [code]: e.target.value }));
                    }}
                    className={`min-w-0 flex-1 rounded-xl border-2 px-3 py-1.5 text-sm font-bold text-gray-900 outline-none focus:border-blue-500 ${
                      parsedFixed.invalid.includes(code) ? "border-red-300" : "border-gray-100"
                    }`}
                  />
                  <span className="text-sm font-black text-gray-500">₺</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || busy}
          className="min-h-11 px-5 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Kaydediliyor…" : "Para birimlerini kaydet"}
        </button>
        {message && (
          <p className={`text-xs font-bold ${message.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
