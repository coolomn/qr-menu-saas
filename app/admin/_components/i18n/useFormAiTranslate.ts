"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import { runAiTranslate, type AiTranslateRunResult } from "@/lib/admin-menu/ai-translate-client";
import {
  aiFillMessage,
  buildMissingTranslationJobs,
  type TranslatableEntity,
} from "@/lib/admin-menu/form-ai-translate";

/**
 * Faz 2.5b: form içi "Boşları AI ile çevir". `apply` sonucu forma işler (applyAiResults ile;
 * kullanıcının beklerken yazdıklarını ezmez).
 */
export function useFormAiTranslate(restaurantId: string | null | undefined) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const runningRef = useRef(false);
  // Form oturumu: reset() (form açılış/kapanışı) ve bileşen kaldırılması numarayı artırır;
  // önceki oturumda başlamış isteğin sonucu yeni açılan kayda UYGULANMAZ.
  const sessionRef = useRef(0);
  const cancelRef = useRef({ cancelled: false });

  useEffect(
    () => () => {
      sessionRef.current += 1;
      cancelRef.current.cancelled = true;
    },
    []
  );

  const run = useCallback(
    async (
      entities: readonly TranslatableEntity[],
      languages: readonly TranslationLanguage[],
      apply: (results: AiTranslateRunResult["results"]) => void
    ) => {
      if (runningRef.current) return;
      if (!restaurantId) {
        setMessage("Restoran bulunamadı.");
        return;
      }
      const jobs = buildMissingTranslationJobs(entities, languages);
      if (jobs.length === 0) {
        setMessage("Çevrilecek boş alan yok: Türkçe metni olan tüm alanlar çevrilmiş.");
        return;
      }
      const session = sessionRef.current;
      const signal = { cancelled: false };
      cancelRef.current = signal;
      runningRef.current = true;
      setBusy(true);
      setMessage(null);
      try {
        const result = await runAiTranslate({ restaurantId, jobs, signal });
        if (session !== sessionRef.current) return; // form kapandı / başka kayıt açıldı
        if (result.translatedFields > 0) apply(result.results);
        setMessage(aiFillMessage(result.translatedFields, result.error));
      } finally {
        if (session === sessionRef.current) {
          runningRef.current = false;
          setBusy(false);
        }
      }
    },
    [restaurantId]
  );

  /** Form açılır/kapanırken çağrılır: bekleyen AI sonucu atılır, mesaj silinir. */
  const reset = useCallback(() => {
    sessionRef.current += 1;
    cancelRef.current.cancelled = true;
    runningRef.current = false;
    setBusy(false);
    setMessage(null);
  }, []);

  return { busy, message, run, reset };
}
