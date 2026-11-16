"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { LANGUAGE_INFO, pickLang, type MenuLanguage } from "@/lib/i18n/languages";

/** 3 ve altı dilde eski görünüm (yan yana kısaltmalar); fazlasında açılır liste. */
const INLINE_LIMIT = 3;

type LanguageSwitcherProps = {
  languages: readonly MenuLanguage[];
  value: string;
  onChange: (language: MenuLanguage) => void;
  /** Kutunun sınıfı (temadan). */
  className: string;
  activeClassName: string;
  inactiveClassName: string;
};

export function LanguageSwitcher({
  languages,
  value,
  onChange,
  className,
  activeClassName,
  inactiveClassName,
}: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (languages.length <= 1) return null;

  const label = pickLang(value, {
    tr: "Dil",
    en: "Language",
    ru: "Язык",
    de: "Sprache",
    fr: "Langue",
    es: "Idioma",
    it: "Lingua",
    uk: "Мова",
    zh: "语言",
    az: "Dil",
  });

  if (languages.length <= INLINE_LIMIT) {
    return (
      <div className={className} role="group" aria-label={label}>
        {languages.map((lang) => (
          <button
            key={lang}
            type="button"
            lang={lang}
            aria-pressed={value === lang}
            aria-label={LANGUAGE_INFO[lang].nativeName}
            onClick={() => onChange(lang)}
            className={value === lang ? activeClassName : inactiveClassName}
          >
            {LANGUAGE_INFO[lang].short}
          </button>
        ))}
      </div>
    );
  }

  const current = LANGUAGE_INFO[(languages as readonly string[]).includes(value) ? (value as MenuLanguage) : "tr"];

  return (
    <div ref={rootRef} className="relative flex-shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${current.nativeName}`}
        onClick={() => setOpen((v) => !v)}
        className={`${className} items-center`}
      >
        <Globe className="h-4 w-4 opacity-70" aria-hidden />
        <span className={activeClassName}>{current.short}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-48 overflow-y-auto rounded-2xl border border-gray-100 bg-white py-1.5 text-gray-900 shadow-xl"
        >
          {languages.map((lang) => {
            const selected = value === lang;
            return (
              <li key={lang} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  lang={lang}
                  onClick={() => {
                    onChange(lang);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                    selected ? "bg-gray-100 font-black" : "font-semibold hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="w-8 text-xs font-black text-gray-400">{LANGUAGE_INFO[lang].short}</span>
                    {LANGUAGE_INFO[lang].nativeName}
                  </span>
                  {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
