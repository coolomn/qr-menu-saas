"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  intlLocale,
  isMenuLanguage,
  normalizeMenuLanguages,
  pickInitialMenuLanguage,
  type MenuLanguage,
} from "@/lib/i18n/languages";

const STORAGE_KEY = "tapmenu:menu-language";

function readStoredLanguage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLanguage(language: MenuLanguage) {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    /* gizli sekme / engelli depolama: seçim yalnız bu sayfada geçerli */
  }
}

/**
 * Müşteri menüsü dili. İşletmenin dilleri yüklenince bir kez seçilir:
 * ?lang= > daha önce seçilen > tarayıcı dili > TR. Seçim cihazda hatırlanır.
 */
export function useMenuLanguage(rawLanguages: unknown | undefined) {
  const [language, setLanguageState] = useState<MenuLanguage>("tr");
  const available = rawLanguages === undefined ? null : normalizeMenuLanguages(rawLanguages);
  const availableKey = available?.join(",") ?? "";
  const initialized = useRef(false);

  useEffect(() => {
    if (!availableKey || initialized.current) return;
    initialized.current = true;
    const list = availableKey.split(",").filter(isMenuLanguage);
    const urlLang = new URLSearchParams(window.location.search).get("lang");
    const initial = pickInitialMenuLanguage(list, {
      urlLang,
      storedLang: readStoredLanguage(),
      browserLanguages: typeof navigator !== "undefined" ? navigator.languages : [],
    });
    setLanguageState(initial);
  }, [availableKey]);

  useEffect(() => {
    document.documentElement.lang = intlLocale(language).split("-")[0] ?? "tr";
  }, [language]);

  const setLanguage = useCallback(
    (next: string) => {
      if (!isMenuLanguage(next)) return;
      if (availableKey && !availableKey.split(",").includes(next)) return;
      setLanguageState(next);
      writeStoredLanguage(next);
    },
    [availableKey]
  );

  return { language, setLanguage, languages: available ?? (["tr"] as MenuLanguage[]) };
}
