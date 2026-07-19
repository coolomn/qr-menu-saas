import OpenAI from "openai";
import { parseJsonFromModelContent } from "../parse-json";
import type { ExcelProductCandidate } from "./types";

/**
 * Yalnızca düşük güvenli / belirsiz adayları AI ile düzeltir.
 * Ham Excel dosyası gönderilmez. AI başarısız olursa orijinal adaylar korunur.
 */
export async function maybeNormalizeAmbiguousWithAi(
  candidates: ExcelProductCandidate[]
): Promise<ExcelProductCandidate[]> {
  const ambiguous = candidates.filter((c) => c.reviewRequired || c.confidence < 0.7);
  if (ambiguous.length === 0) return candidates;
  // Cap AI batch size
  const batch = ambiguous.slice(0, 40);

  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return candidates;

  const openai = new OpenAI({ apiKey: key });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 4000,
    messages: [
      {
        role: "system",
        content:
          "Menü satırlarını normalize et. Yalnızca geçerli JSON döndür. Markdown yok. Şema: {\"items\":[{\"index\":0,\"name\":\"\",\"category\":null,\"description\":null,\"price\":null,\"variant\":null}]}",
      },
      {
        role: "user",
        content: JSON.stringify({
          items: batch.map((c, index) => ({
            index,
            name: c.name,
            category: c.category,
            description: c.description,
            price: c.price,
            variant: c.variant,
            warnings: c.warnings,
          })),
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) return candidates;

  let parsed: unknown;
  try {
    parsed = parseJsonFromModelContent(raw);
  } catch (e) {
    console.error("[menu-import/excel] AI JSON parse failed:", {
      error: e instanceof Error ? e.message : e,
      rawPreview: raw.slice(0, 500),
    });
    return candidates;
  }

  const items =
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { items?: unknown }).items)
      ? ((parsed as { items: unknown[] }).items as Record<string, unknown>[])
      : null;

  if (!items) return candidates;

  const byIndex = new Map<number, Record<string, unknown>>();
  for (const item of items) {
    const idx = Number(item.index);
    if (Number.isInteger(idx)) byIndex.set(idx, item);
  }

  return candidates.map((c) => {
    const ambIdx = batch.indexOf(c);
    if (ambIdx < 0) return c;
    const patch = byIndex.get(ambIdx);
    if (!patch) return c;

    const name = typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : c.name;
    const category =
      typeof patch.category === "string" && patch.category.trim()
        ? patch.category.trim()
        : c.category;
    const description =
      typeof patch.description === "string" && patch.description.trim()
        ? patch.description.trim()
        : c.description;
    const price =
      typeof patch.price === "string" && patch.price.trim()
        ? patch.price.trim()
        : patch.price === null
          ? c.price
          : c.price;
    const variant =
      typeof patch.variant === "string" && patch.variant.trim()
        ? patch.variant.trim()
        : c.variant;

    return {
      ...c,
      name,
      category,
      description,
      price,
      variant,
      confidence: Math.max(c.confidence, 0.75),
      reviewRequired: false,
      warnings: c.warnings.filter((w) => !w.includes("belirsiz")),
    };
  });
}
