import { summarizeCspReport } from "@/lib/security/csp-report";

export const runtime = "nodejs";

const MAX_BODY = 16_384;

/**
 * Tarayıcıların gönderdiği CSP ihlal raporları. Hiçbir şey saklanmaz; özet Vercel loguna yazılır.
 * Herkese açıktır (tarayıcı kimlik göndermez); bu yüzden yalnızca kısaltılmış alanlar loglanır.
 */
export async function POST(request: Request) {
  try {
    const text = (await request.text()).slice(0, MAX_BODY);
    for (const line of summarizeCspReport(text)) console.warn("[csp]", line);
  } catch {
    // Rapor bozuksa yok say.
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
