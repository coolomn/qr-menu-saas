"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CURRENCY_INFO,
  isCurrencyCode,
  normalizePublicCurrencyRates,
  pickInitialCurrency,
  type CurrencyCode,
  type PublicCurrencyRate,
} from "@/lib/currency/currencies";
import { approxText, rateLabel } from "@/lib/currency/approx";
import { pickLang, toMenuLanguage, type LocalizedString } from "@/lib/i18n/languages";

/**
 * Faz 2.5c: müşteri menüsünde seçilen döviz. Ana fiyat her zaman TL; seçili dövizde fiyatın yanında
 * "≈ €12" görünür. Misafir seçim yapmadıysa menü diline göre önerilir (TR menüde kapalı);
 * seçim (TL dahil) cihazda hatırlanır.
 */
const STORAGE_KEY = "tapmenu:menu-currency";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Depolama engelliyse seçim bu sayfa açıkken bellekte tutulur.
let memoryChoice: string | undefined;
const listeners = new Set<() => void>();

function writeStored(value: string) {
  memoryChoice = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* gizli sekme / engelli depolama: seçim yalnız bu sayfada geçerli */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

const getSnapshot = (): string | null => memoryChoice ?? readStored();
// Sunucu/ilk çizim: seçim bilinmiyor → döviz kapalı (hidrasyon uyuşmazlığı olmasın).
const getServerSnapshot = (): string | null | undefined => undefined;

export function useMenuCurrency(rawRates: unknown, language: string) {
  const rates = useMemo(() => normalizePublicCurrencyRates(rawRates), [rawRates]);
  // undefined: depolama henüz okunmadı (sunucu/ilk çizim ile aynı görünüm için).
  const stored = useSyncExternalStore<string | null | undefined>(subscribe, getSnapshot, getServerSnapshot);

  const code =
    stored === undefined
      ? null
      : pickInitialCurrency(
          rates.map((r) => r.code),
          { stored, language: toMenuLanguage(language) }
        );
  const rate = code ? rates.find((r) => r.code === code) ?? null : null;

  const setCurrency = useCallback((next: CurrencyCode | "TRY") => {
    if (next !== "TRY" && !isCurrencyCode(next)) return;
    writeStored(next);
  }, []);

  return { rates, rate, setCurrency };
}

type MenuCurrencyValue = { rate: PublicCurrencyRate | null; language: string };

const MenuCurrencyContext = createContext<MenuCurrencyValue>({ rate: null, language: "tr" });

export function MenuCurrencyProvider({
  rate,
  language,
  children,
}: MenuCurrencyValue & { children: ReactNode }) {
  const value = useMemo(() => ({ rate, language }), [rate, language]);
  return <MenuCurrencyContext.Provider value={value}>{children}</MenuCurrencyContext.Provider>;
}

/** Seçili dövizde "≈ €12" metni; döviz kapalıysa ya da fiyat belirsizse null. */
export function useApproxText(raw: string | number | null | undefined, opts: { signed?: boolean } = {}): string | null {
  const { rate, language } = useContext(MenuCurrencyContext);
  if (!rate) return null;
  return approxText(raw, rate, language, opts);
}

/** Fiyatın yanındaki küçük yaklaşık tutar (renk fiyattan miras). */
export function ApproxAmount({
  raw,
  signed,
  className = "",
}: {
  raw: string | number | null | undefined;
  signed?: boolean;
  className?: string;
}) {
  const text = useApproxText(raw, { signed });
  if (!text) return null;
  return <span className={`whitespace-nowrap text-[0.72em] font-semibold opacity-75 ${className}`}>{text}</span>;
}

const CURRENCY_LABEL: LocalizedString = {
  tr: "Para birimi",
  en: "Currency",
  ru: "Валюта",
  de: "Währung",
  fr: "Devise",
  es: "Moneda",
  it: "Valuta",
  uk: "Валюта",
  zh: "货币",
  az: "Valyuta",
};

const APPROX_NOTE: LocalizedString = {
  tr: "Döviz karşılıkları yaklaşıktır, ödeme TL ile yapılır",
  en: "Converted prices are approximate; you pay in Turkish lira",
  ru: "Цены в валюте приблизительные, оплата в турецких лирах",
  de: "Umgerechnete Preise sind ungefähr; bezahlt wird in Türkischer Lira",
  fr: "Les montants convertis sont approximatifs ; paiement en livres turques",
  es: "Los importes convertidos son aproximados; se paga en liras turcas",
  it: "Gli importi convertiti sono indicativi; si paga in lire turche",
  uk: "Ціни у валюті приблизні, оплата в турецьких лірах",
  zh: "外币价格仅供参考，以土耳其里拉结算",
  az: "Valyuta qiymətləri təxminidir, ödəniş türk lirəsi ilədir",
};

/** Filtre çubuğundaki döviz seçici (yalnız işletme döviz açtıysa). */
export function CurrencySelect({
  rates,
  value,
  onChange,
  language,
  className,
  style,
}: {
  rates: PublicCurrencyRate[];
  value: PublicCurrencyRate | null;
  onChange: (next: CurrencyCode | "TRY") => void;
  language: string;
  className: string;
  style?: CSSProperties;
}) {
  if (rates.length === 0) return null;
  return (
    <>
      <label className="sr-only" htmlFor="menu-currency">
        {pickLang(language, CURRENCY_LABEL)}
      </label>
      <select
        id="menu-currency"
        value={value?.code ?? "TRY"}
        onChange={(e) => onChange(e.target.value as CurrencyCode | "TRY")}
        className={className}
        style={style}
      >
        <option value="TRY">₺ TL</option>
        {rates.map((r) => (
          <option key={r.code} value={r.code}>
            ≈ {CURRENCY_INFO[r.code].symbol === r.code ? r.code : `${CURRENCY_INFO[r.code].symbol} ${r.code}`}
          </option>
        ))}
      </select>
    </>
  );
}

/** "Döviz karşılıkları yaklaşıktır… · €1 = 55,60 ₺" — seçili döviz varken. */
export function CurrencyNote({ className = "" }: { className?: string }) {
  const { rate, language } = useContext(MenuCurrencyContext);
  if (!rate) return null;
  return (
    <p className={`text-[11px] leading-snug opacity-70 ${className}`} role="note">
      {pickLang(language, APPROX_NOTE)} · {rateLabel(rate, language)}
    </p>
  );
}
