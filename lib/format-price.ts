const TL = "\u20BA";

/** Sonda/başta tekrarlayan para birimi işaretlerini kaldırıp sona tek ₺ ekler (gösterim için). */
export function formatPriceForDisplay(raw: string | null | undefined): string {
  let s = raw == null ? "" : String(raw).trim();
  if (!s) return "";

  const start = /^(?:₺|TL|TRY)\s*/i;
  const end = /\s*(?:₺|TL|TRY)$/i;

  let prev: string;
  do {
    prev = s;
    s = s.replace(start, "").replace(end, "").trim();
  } while (s !== prev);

  if (!s) return "";
  return `${s} ${TL}`;
}
