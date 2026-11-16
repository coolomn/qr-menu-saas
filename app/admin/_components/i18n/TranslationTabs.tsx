"use client";

import { useState, type ReactNode } from "react";
import { Languages, Sparkles } from "lucide-react";
import { LANGUAGE_INFO, type TranslationLanguage } from "@/lib/i18n/languages";
import type { TranslationStatus } from "@/lib/i18n/edit-translations";

const STATUS_DOT: Record<TranslationStatus, string> = {
  full: "bg-emerald-500",
  partial: "bg-amber-400",
  empty: "bg-gray-300",
  none: "bg-gray-200",
};

const STATUS_TEXT: Record<TranslationStatus, string> = {
  full: "tamam",
  partial: "eksik var",
  empty: "çevrilmemiş",
  none: "çevrilecek metin yok",
};

/** Dil çipleri: kısa kod + doluluk noktası. */
export function TranslationLanguageChips({
  languages,
  active,
  onChange,
  statusFor,
}: {
  languages: readonly TranslationLanguage[];
  active: TranslationLanguage;
  onChange: (language: TranslationLanguage) => void;
  statusFor?: (language: TranslationLanguage) => TranslationStatus;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Çeviri dili">
      {languages.map((lang) => {
        const status = statusFor?.(lang) ?? "none";
        const selected = lang === active;
        return (
          <button
            key={lang}
            type="button"
            role="tab"
            aria-selected={selected}
            title={`${LANGUAGE_INFO[lang].turkishName} — ${STATUS_TEXT[status]}`}
            onClick={() => onChange(lang)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-black transition-colors ${
              selected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
            }`}
          >
            <span>{LANGUAGE_INFO[lang].short}</span>
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${STATUS_DOT[status]} ${selected ? "ring-2 ring-white/70" : ""}`}
            />
            <span className="sr-only">{STATUS_TEXT[status]}</span>
          </button>
        );
      })}
    </div>
  );
}

export const translationInputClass =
  "w-full max-w-full min-w-0 box-border rounded-xl border-2 border-gray-100 bg-white p-3 text-xs md:text-sm font-bold text-gray-900 outline-none focus:border-blue-400";

/**
 * Faz 2.5b: formlardaki çeviri bölümü. Menüde açık her dil bir sekme; içerik children(dil) ile çizilir.
 * Dil yoksa (yalnız Türkçe) kısa bir yönlendirme gösterir.
 */
export function TranslationSection({
  languages,
  statusFor,
  onAiFill,
  aiBusy = false,
  aiMessage,
  hint,
  children,
}: {
  languages: readonly TranslationLanguage[];
  statusFor?: (language: TranslationLanguage) => TranslationStatus;
  /** "Boşları AI ile çevir" (tüm açık diller). Yoksa düğme gösterilmez. */
  onAiFill?: () => void;
  aiBusy?: boolean;
  aiMessage?: string | null;
  hint?: string;
  children: (language: TranslationLanguage) => ReactNode;
}) {
  const [active, setActive] = useState<TranslationLanguage | null>(null);
  const current = active && languages.includes(active) ? active : languages[0];

  if (!current) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-3 text-[11px] font-medium leading-snug text-gray-500">
        <span className="inline-flex items-center gap-1 font-black text-gray-700">
          <Languages size={13} aria-hidden /> Çeviriler
        </span>{" "}
        — Menünüzde yalnız Türkçe açık. Başka dil eklemek için sol menüden <b>Diller &amp; Çeviri</b> sayfasını açın.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border-2 border-gray-50 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500">
          <Languages size={13} aria-hidden /> Çeviriler
        </span>
        {onAiFill && (
          <button
            type="button"
            onClick={onAiFill}
            disabled={aiBusy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[11px] font-black text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <Sparkles size={13} aria-hidden />
            {aiBusy ? "Çevriliyor…" : "Boşları AI ile çevir"}
          </button>
        )}
      </div>
      <TranslationLanguageChips languages={languages} active={current} onChange={setActive} statusFor={statusFor} />
      {aiMessage && (
        <p className="text-[11px] font-bold leading-snug text-gray-600" role="status">
          {aiMessage}
        </p>
      )}
      <div className="space-y-2" role="tabpanel" aria-label={`${LANGUAGE_INFO[current].turkishName} çeviri`}>
        {children(current)}
      </div>
      <p className="text-[10px] font-medium leading-snug text-gray-400">
        {hint ??
          "Boş bırakılan çeviride müşteri Türkçe metni görür. AI yalnız boş alanları doldurur; yazdıklarınız değişmez."}
      </p>
    </div>
  );
}
