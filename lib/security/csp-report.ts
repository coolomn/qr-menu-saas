type Raw = Record<string, unknown>;

const clip = (v: unknown, n = 200) => (typeof v === "string" ? v.slice(0, n) : "");

/** Sorgu dizesini at: menü/admin adreslerinde kişisel veri olmasın. */
function stripQuery(u: string): string {
  const i = u.search(/[?#]/);
  return i === -1 ? u : u.slice(0, i);
}

function line(r: Raw): string | null {
  const directive = clip(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective, 60);
  if (!directive) return null;
  const blocked = stripQuery(clip(r["blocked-uri"] ?? r.blockedURL ?? r.blockedUri));
  const page = stripQuery(clip(r["document-uri"] ?? r.documentURL ?? r.documentUri));
  return `${directive} blocked=${blocked || "-"} page=${page || "-"}`;
}

/**
 * Hem eski "application/csp-report" ({"csp-report": {...}}) hem Reporting API
 * ([{type:"csp-violation", body:{...}}]) biçimini kısa log satırlarına çevirir. En fazla 10 satır.
 */
export function summarizeCspReport(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const items: Raw[] = [];
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      const body = (entry as Raw | null)?.body;
      if (body && typeof body === "object") items.push(body as Raw);
    }
  } else if (parsed && typeof parsed === "object") {
    const inner = (parsed as Raw)["csp-report"];
    items.push((inner && typeof inner === "object" ? inner : parsed) as Raw);
  }
  return items
    .slice(0, 10)
    .map(line)
    .filter((l): l is string => l !== null);
}
