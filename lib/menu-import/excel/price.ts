/** Türkçe / TR fiyat biçimleri → normalize rakam string (veya null). */

const CURRENCY_MARKERS = /(?:₺|tl|try|try\.?|lira)/i;

/** Ölçü / hacim / yüzde — fiyat değil. */
const NON_PRICE_MEASURE =
  /^\s*\d+([.,]\d+)?\s*(cl|ml|lt|l|litre|liter|gr|g|kg|%|’lik|'lik|lik)\b/i;

const VARIANT_LIKE =
  /^(tek|duble|şişe|sise|kadeh|kucuk|küçük|orta|buyuk|büyük)\s*$/i;

export type ParsedExcelPrice = {
  amount: string;
  currency: string | null;
  raw: string;
};

function stripCurrency(raw: string): { text: string; currency: string | null } {
  let currency: string | null = null;
  let text = raw.trim();
  if (/₺/.test(text)) {
    currency = "TRY";
    text = text.replace(/₺/g, " ");
  }
  if (CURRENCY_MARKERS.test(text)) {
    currency = currency ?? "TRY";
    text = text.replace(CURRENCY_MARKERS, " ");
  }
  // "575,- TL" → trailing ,-
  text = text.replace(/,-\s*$/i, "").replace(/,-/g, "");
  return { text: text.replace(/\s+/g, " ").trim(), currency };
}

/**
 * "1.900 TL" → 1900, "495,00" → 495, "1,900" (binlik EN) → 1900
 * Ambiguous: tek nokta/virgül — TR varsayımı: nokta binlik, virgül ondalık.
 */
export function normalizeTurkishNumber(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Son ayırıcı ondalık kabul edilir
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0].replace(/\./g, "")}.${parts[1]}`;
    } else {
      // 1,900 binlik
      s = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length <= 2 && parts[0].length <= 3) {
      // 495.50 ondalık olabilir; 1.900 → binlik (3 haneli sağ)
      if (parts[1].length === 3) {
        s = s.replace(/\./g, "");
      }
      // else keep as decimal
    } else {
      s = s.replace(/\./g, "");
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  // Menü fiyatları genelde tam sayı; ondalıklıysa 2 basamak
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.00$/, "");
}

export function looksLikeMeasureNotPrice(raw: string): boolean {
  const t = raw.trim();
  if (NON_PRICE_MEASURE.test(t)) return true;
  if (VARIANT_LIKE.test(t)) return true;
  // Saf küçük sayı + cl bağlamı başka hücrede olabilir; burada sadece tek hücre
  if (/^\d{1,3}\s*$/.test(t) && Number(t) <= 100) {
    // Tek başına 33/50/70 fiyat da olabilir — varyant etiketi kontrolü çağıranda
    return false;
  }
  return false;
}

/** Hücre metninden fiyat çıkar; ölçü ise null. */
export function parseExcelPrice(raw: unknown): ParsedExcelPrice | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 0 && raw <= 1_000_000) {
      // 0.7 litre benzeri küçük ondalık → ölçü adayı
      if (raw > 0 && raw < 10 && !Number.isInteger(raw)) {
        return null;
      }
      const amount = Number.isInteger(raw) ? String(raw) : String(raw);
      return { amount: normalizeTurkishNumber(amount) ?? amount, currency: null, raw: String(raw) };
    }
    return null;
  }

  if (typeof raw !== "string") return null;
  const original = raw.trim();
  if (!original) return null;

  if (looksLikeMeasureNotPrice(original)) return null;

  const { text, currency } = stripCurrency(original);
  if (!text) return null;

  // "Aperol White Spritz - 495 TL" → sondaki fiyat
  const trailing = text.match(/([\d.,]+)\s*$/);
  if (!trailing) return null;

  // Ölçü ifadesi içindeyse reddet
  const before = text.slice(0, trailing.index).trim();
  if (/\b(cl|ml|lt|l|litre|%|’lik|'lik)\b/i.test(before) && !CURRENCY_MARKERS.test(original) && !/₺/.test(original)) {
    // "33 cl" zaten measure; "495" tek başına OK
  }
  if (NON_PRICE_MEASURE.test(trailing[1] + " cl")) {
    /* skip */
  }

  // Saf ölçü: "33 cl"
  if (NON_PRICE_MEASURE.test(original)) return null;

  // Metin + fiyat: en az bir rakam grubu ve currency veya satır sonu fiyat
  const hasCurrency = Boolean(currency) || /₺|tl\b/i.test(original);
  const onlyNumber = /^[\d.,]+$/.test(text);

  if (!onlyNumber && !hasCurrency && !/[-–—]\s*[\d.,]+\s*$/.test(text)) {
    // "Aperol ... 495" tire ile
    if (!/[\d.,]{2,}\s*$/.test(text)) return null;
  }

  // Ölçü etiketi gibi görünen küçük sayılar (20, 33, 35, 50, 70) currency yoksa şüpheli
  const amountCandidate = trailing[1];
  const normalized = normalizeTurkishNumber(amountCandidate);
  if (!normalized) return null;

  const n = Number(normalized);
  if (!hasCurrency && onlyNumber && [20, 33, 35, 50, 70].includes(n)) {
    return null;
  }

  return {
    amount: normalized,
    currency: currency,
    raw: original,
  };
}

/** "Name - 495 TL" → { name, price } */
export function splitNameAndPrice(raw: string): { name: string; price: ParsedExcelPrice | null } {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(.*?)\s*[-–—]\s*([\d.,]+(?:\s*(?:₺|TL|tl))?)\s*$/);
  if (m) {
    const price = parseExcelPrice(m[2]);
    if (price) {
      return { name: m[1].trim(), price };
    }
  }
  const priceOnly = parseExcelPrice(trimmed);
  if (priceOnly && /^[\d.,\s₺TLtlTRY.-]+$/.test(trimmed)) {
    return { name: "", price: priceOnly };
  }
  return { name: trimmed, price: null };
}
