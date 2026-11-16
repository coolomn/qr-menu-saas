import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  convertFromTry,
  formatApproxAmount,
  normalizeDisplayCurrencies,
  normalizeFixedRates,
  normalizePublicCurrencyRates,
  pickInitialCurrency,
  resolvePublicCurrencyRates,
} from "./currencies";
import { parseTcmbXml, refreshExchangeRates } from "./tcmb";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="13.11.2026" Date="11/13/2026"  Bulten_No="2026/214" >
	<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
			<Unit>1</Unit>
			<Isim>ABD DOLARI</Isim>
			<ForexBuying>50.1926</ForexBuying>
			<ForexSelling>50.2830</ForexSelling>
			<BanknoteSelling>50.3584</BanknoteSelling>
	</Currency>
	<Currency CrossOrder="1" Kod="AUD" CurrencyCode="AUD">
			<Unit>1</Unit>
			<ForexSelling>34.2420</ForexSelling>
	</Currency>
	<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
			<Unit>1</Unit>
			<ForexSelling>55.6033</ForexSelling>
	</Currency>
	<Currency CrossOrder="11" Kod="JPY" CurrencyCode="JPY">
			<Unit>100</Unit>
			<ForexSelling>31.5257</ForexSelling>
	</Currency>
	<Currency CrossOrder="13" Kod="RUB" CurrencyCode="RUB">
			<Unit>1</Unit>
			<ForexSelling>0.61479</ForexSelling>
			<BanknoteSelling></BanknoteSelling>
	</Currency>
	<Currency CrossOrder="14" Kod="AZN" CurrencyCode="AZN">
			<Unit>1</Unit>
			<ForexSelling></ForexSelling>
	</Currency>
</Tarih_Date>`;

describe("parseTcmbXml", () => {
  it("reads bulletin date and per-unit selling rates for supported currencies", () => {
    const parsed = parseTcmbXml(SAMPLE_XML);
    assert.ok(parsed);
    assert.equal(parsed.rateDate, "2026-11-13");
    assert.equal(parsed.rates.USD, 50.283);
    assert.equal(parsed.rates.EUR, 55.6033);
    assert.equal(parsed.rates.RUB, 0.61479);
    assert.equal(parsed.rates.JPY, 0.315257, "JPY bülteni 100 birim üzerinden");
    assert.equal("AUD" in parsed.rates, false, "desteklenmeyen döviz alınmaz");
    assert.equal("AZN" in parsed.rates, false, "boş kur alınmaz");
  });

  it("returns null for unexpected responses", () => {
    assert.equal(parseTcmbXml("<html>bakım</html>"), null);
    assert.equal(parseTcmbXml('<Tarih_Date Date="11/13/2026"></Tarih_Date>'), null);
  });
});

describe("refreshExchangeRates", () => {
  function fakeAdmin(error: { message: string } | null = null) {
    const calls: Array<{ rows: unknown; opts: unknown }> = [];
    const admin = {
      from(table: string) {
        assert.equal(table, "exchange_rates");
        return {
          upsert(rows: unknown, opts: unknown) {
            calls.push({ rows, opts });
            return Promise.resolve({ error });
          },
        };
      },
    } as unknown as SupabaseClient;
    return { admin, calls };
  }

  it("upserts parsed rates with fetched_at", async () => {
    const { admin, calls } = fakeAdmin();
    const now = new Date("2026-11-16T03:00:00Z");
    const result = await refreshExchangeRates(admin, {
      now,
      fetchImpl: (async () => new Response(SAMPLE_XML, { status: 200 })) as typeof fetch,
    });
    assert.deepEqual(result, { updated: 4, rateDate: "2026-11-13" });
    const rows = calls[0].rows as Array<Record<string, unknown>>;
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.find((r) => r.currency === "EUR"), {
      currency: "EUR",
      try_per_unit: 55.6033,
      rate_date: "2026-11-13",
      source: "tcmb",
      fetched_at: now.toISOString(),
    });
    assert.deepEqual(calls[0].opts, { onConflict: "currency" });
  });

  it("throws (and writes nothing) on HTTP error or unreadable body", async () => {
    const { admin, calls } = fakeAdmin();
    await assert.rejects(
      refreshExchangeRates(admin, { fetchImpl: (async () => new Response("", { status: 503 })) as typeof fetch }),
      /503/
    );
    await assert.rejects(
      refreshExchangeRates(admin, { fetchImpl: (async () => new Response("<html/>", { status: 200 })) as typeof fetch }),
      /okunamadı/
    );
    assert.equal(calls.length, 0);
  });

  it("throws when the DB write fails", async () => {
    const { admin } = fakeAdmin({ message: "boom" });
    await assert.rejects(
      refreshExchangeRates(admin, { fetchImpl: (async () => new Response(SAMPLE_XML)) as typeof fetch }),
      /boom/
    );
  });
});

describe("normalize helpers", () => {
  it("display currencies: unknown/duplicate dropped, max 5", () => {
    assert.deepEqual(normalizeDisplayCurrencies(["EUR", "XXX", "EUR", "usd", "USD"]), ["EUR", "USD"]);
    assert.deepEqual(normalizeDisplayCurrencies(null), []);
    assert.deepEqual(
      normalizeDisplayCurrencies(["EUR", "USD", "GBP", "RUB", "CHF", "AZN"]),
      ["EUR", "USD", "GBP", "RUB", "CHF"]
    );
  });

  it("fixed rates: only positive numbers for known codes", () => {
    assert.deepEqual(normalizeFixedRates({ EUR: 50, USD: "45", GBP: -1, XXX: 3, RUB: 0.6 }), { EUR: 50, RUB: 0.6 });
    assert.deepEqual(normalizeFixedRates([1, 2]), {});
    assert.deepEqual(normalizeFixedRates(null), {});
  });

  it("public rates payload is validated", () => {
    assert.deepEqual(
      normalizePublicCurrencyRates([
        { code: "EUR", try_per_unit: 50, fixed: true, rate_date: null },
        { code: "EUR", try_per_unit: 51, fixed: false, rate_date: "2026-11-13" },
        { code: "XXX", try_per_unit: 1 },
        { code: "USD", try_per_unit: 0 },
        "junk",
      ]),
      [{ code: "EUR", try_per_unit: 50, fixed: true, rate_date: null }]
    );
    assert.deepEqual(normalizePublicCurrencyRates(undefined), []);
  });
});

describe("resolvePublicCurrencyRates", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const live = [
    { currency: "EUR", try_per_unit: "55.6033", rate_date: "2026-11-13", fetched_at: "2026-11-16T03:00:00Z" },
    { currency: "USD", try_per_unit: 50.283, rate_date: "2026-11-13", fetched_at: "2026-11-12T03:00:00Z" },
    { currency: "GBP", try_per_unit: 66.6466, rate_date: "2026-11-13", fetched_at: "2026-11-16T03:00:00Z" },
  ];

  it("keeps business order, prefers fixed rate, hides stale and missing rates", () => {
    const out = resolvePublicCurrencyRates({
      displayCurrencies: ["GBP", "USD", "EUR", "RUB", "CHF"],
      fixedRates: { RUB: 0.6, EUR: 50 },
      liveRates: live,
      now,
    });
    assert.deepEqual(out, [
      { code: "GBP", try_per_unit: 66.6466, fixed: false, rate_date: "2026-11-13" },
      { code: "EUR", try_per_unit: 50, fixed: true, rate_date: null },
      { code: "RUB", try_per_unit: 0.6, fixed: true, rate_date: null },
    ]);
  });

  it("a live rate fetched exactly 72h ago is still shown, older is hidden", () => {
    const edge = [{ currency: "EUR", try_per_unit: 55, rate_date: "2026-11-13", fetched_at: "2026-11-13T12:00:00Z" }];
    assert.equal(resolvePublicCurrencyRates({ displayCurrencies: ["EUR"], fixedRates: {}, liveRates: edge, now }).length, 1);
    const older = [{ ...edge[0], fetched_at: "2026-11-13T11:59:00Z" }];
    assert.equal(resolvePublicCurrencyRates({ displayCurrencies: ["EUR"], fixedRates: {}, liveRates: older, now }).length, 0);
  });
});

describe("pickInitialCurrency", () => {
  const available = ["EUR", "USD", "RUB"] as const;
  it("stored choice wins (TRY = off)", () => {
    assert.equal(pickInitialCurrency([...available], { stored: "USD", language: "de" }), "USD");
    assert.equal(pickInitialCurrency([...available], { stored: "TRY", language: "de" }), null);
  });
  it("Turkish menu defaults to off", () => {
    assert.equal(pickInitialCurrency([...available], { stored: null, language: "tr" }), null);
  });
  it("language hint, then first business currency", () => {
    assert.equal(pickInitialCurrency([...available], { stored: null, language: "ru" }), "RUB");
    assert.equal(pickInitialCurrency([...available], { stored: null, language: "fr" }), "EUR");
    assert.equal(pickInitialCurrency(["USD", "GBP"], { stored: null, language: "de" }), "USD");
    assert.equal(pickInitialCurrency([...available], { stored: null, language: "en" }), "EUR");
  });
  it("stored currency no longer offered → falls back", () => {
    assert.equal(pickInitialCurrency(["EUR"], { stored: "GBP", language: "en" }), "EUR");
  });
  it("nothing offered → null", () => {
    assert.equal(pickInitialCurrency([], { stored: "EUR", language: "de" }), null);
  });
});

describe("conversion and formatting", () => {
  const eur = { code: "EUR" as const, try_per_unit: 50, fixed: true, rate_date: null };
  it("converts TL to currency", () => {
    assert.equal(convertFromTry(600, eur), 12);
  });
  it("formats per language; whole numbers from 10 up", () => {
    assert.equal(formatApproxAmount(12.4, "EUR", "tr"), "€12");
    assert.equal(formatApproxAmount(12.4, "EUR", "de").replace(/ /g, " "), "12 €");
    assert.equal(formatApproxAmount(4.5, "EUR", "en"), "€4.50");
    assert.equal(formatApproxAmount(4.5, "RUB", "en"), "₽5");
    assert.equal(formatApproxAmount(1234.6, "USD", "en"), "$1,235");
  });
});

describe("approx text", async () => {
  const { approxText, parseTryAmount, rateLabel } = await import("./approx");
  const eur = { code: "EUR" as const, try_per_unit: 50, fixed: false, rate_date: "2026-11-13" };
  it("parses only unambiguous TL amounts", () => {
    assert.equal(parseTryAmount("120"), 120);
    assert.equal(parseTryAmount("1.250,50 ₺"), 1250.5);
    assert.equal(parseTryAmount("TL 99.90"), 99.9);
    assert.equal(parseTryAmount("+15"), 15);
    assert.equal(parseTryAmount("-15 TL"), -15);
    assert.equal(parseTryAmount("120-150"), null);
    assert.equal(parseTryAmount("Sorunuz"), null);
    assert.equal(parseTryAmount(""), null);
  });
  it("builds ≈ text, signed for option deltas", () => {
    assert.equal(approxText("600", eur, "en"), "≈ €12");
    assert.equal(approxText("+15", eur, "en", { signed: true }), "≈ +€0.30");
    assert.equal(approxText("-15", eur, "en", { signed: true }), "≈ −€0.30");
    assert.equal(approxText("0", eur, "en"), null);
    assert.equal(approxText("120-150", eur, "en"), null);
  });
  it("rate label", () => {
    assert.equal(rateLabel({ ...eur, try_per_unit: 55.6033 }, "tr"), "€1 = 55,60 ₺");
    assert.equal(rateLabel({ ...eur, try_per_unit: 55.6033 }, "de").replace(/ /g, " "), "1 € = 55,60 ₺");
    assert.equal(rateLabel({ code: "RUB", try_per_unit: 0.61479, fixed: false, rate_date: null }, "en"), "₽1 = 0.6148 ₺");
  });
});
