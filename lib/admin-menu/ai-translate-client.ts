"use client";

/**
 * Faz 2.5b: paneldeki "AI ile çevir" düğmeleri için istemci. İşi dil + parça (≤30 öğe) bazında
 * /api/admin/translate'e böler, ikişer ikişer gönderir, ilk hatada durur (o ana kadarki sonuçlar döner).
 */
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import {
  chunkAiTranslateItems,
  compactAiTranslateItems,
  type AiTranslateItem,
  type AiTranslateResults,
} from "@/lib/i18n/ai-translate-request";

export type AiTranslateJob = { language: TranslationLanguage; items: AiTranslateItem[] };

export type AiTranslateRunResult = {
  results: Partial<Record<TranslationLanguage, AiTranslateResults>>;
  /** Kaç alan çevrildi. */
  translatedFields: number;
  /** Durduran hata (varsa); sonuçlar o ana kadar olanlardır. */
  error: string | null;
};

const PARALLEL_REQUESTS = 2;

async function postChunk(
  token: string,
  restaurantId: string,
  language: TranslationLanguage,
  items: AiTranslateItem[]
): Promise<{ ok: true; results: AiTranslateResults } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch("/api/admin/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restaurantId, targetLanguage: language, items }),
    });
  } catch {
    return { ok: false, error: "Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin." };
  }
  let json: { results?: AiTranslateResults; error?: string } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    /* boş gövde */
  }
  if (!res.ok) {
    return { ok: false, error: json.error || "AI çeviri alınamadı." };
  }
  return { ok: true, results: json.results ?? {} };
}

export async function runAiTranslate(options: {
  restaurantId: string;
  jobs: AiTranslateJob[];
  /** Her tamamlanan parçada (ör. ilerleme çubuğu, ara kayıt). */
  onChunk?: (language: TranslationLanguage, results: AiTranslateResults) => void | Promise<void>;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}): Promise<AiTranslateRunResult> {
  const out: AiTranslateRunResult = { results: {}, translatedFields: 0, error: null };
  const tasks: { language: TranslationLanguage; items: AiTranslateItem[] }[] = [];
  for (const job of options.jobs) {
    for (const items of chunkAiTranslateItems(compactAiTranslateItems(job.items))) {
      tasks.push({ language: job.language, items });
    }
  }
  if (tasks.length === 0) return out;

  const {
    data: { session },
  } = await getBrowserSupabase().auth.getSession();
  if (!session?.access_token) {
    return { ...out, error: "Oturum bulunamadı. Sayfayı yenileyip tekrar giriş yapın." };
  }
  const token = session.access_token;

  let next = 0;
  let done = 0;
  options.onProgress?.(0, tasks.length);

  const worker = async () => {
    while (next < tasks.length && !out.error && !options.signal?.cancelled) {
      const task = tasks[next++];
      const res = await postChunk(token, options.restaurantId, task.language, task.items);
      if (!res.ok) {
        out.error = out.error ?? res.error;
        return;
      }
      const bucket = (out.results[task.language] ??= {});
      for (const [id, fields] of Object.entries(res.results)) {
        bucket[id] = { ...(bucket[id] ?? {}), ...fields };
        out.translatedFields += Object.keys(fields).length;
      }
      await options.onChunk?.(task.language, res.results);
      done += 1;
      options.onProgress?.(done, tasks.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(PARALLEL_REQUESTS, tasks.length) }, worker));
  return out;
}
