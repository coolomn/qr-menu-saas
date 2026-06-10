const TL = "\u20BA";

export type ParsedPrice = {
  amount: string;
  currency: string;
};

/** Ham fiyatı rakam + para birimi parçalarına ayırır. */
export function parsePriceForDisplay(
  raw: string | null | undefined
): ParsedPrice | null {
  let s = raw == null ? "" : String(raw).trim();
  if (!s) return null;

  const start = /^(?:₺|TL|TRY)\s*/i;
  const end = /\s*(?:₺|TL|TRY)$/i;

  let prev: string;
  do {
    prev = s;
    s = s.replace(start, "").replace(end, "").trim();
  } while (s !== prev);

  if (!s) return null;
  return { amount: s, currency: TL };
}

/** Gösterim: rakam + bitişik ₺ (ör. 420₺). */
export function formatPriceForDisplay(raw: string | null | undefined): string {
  const parsed = parsePriceForDisplay(raw);
  if (!parsed) return "";
  return `${parsed.amount}${parsed.currency}`;
}
