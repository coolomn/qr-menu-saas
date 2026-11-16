"use client";

import { useState } from "react";
import { Megaphone, X } from "lucide-react";
import {
  announcementDismissKey,
  isAnnouncementLive,
  resolveAnnouncementText,
  type Announcement,
} from "@/lib/public-menu/announcement";
import { pickLang } from "@/lib/i18n/languages";

type Props = {
  announcement: Announcement | null | undefined;
  /** Restoran slug'ı: kapatma anahtarını restorana özel yapar. */
  scope: string;
  language: string;
  /** Şerit rengi (menü teması vurgusu). */
  accentColor: string;
  now: Date;
  className?: string;
};

/** #rgb / #rrggbb → koyu zeminde beyaz, açık zeminde koyu yazı. Çözülemezse beyaz. */
function readableTextColor(hex: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? "#111827" : "#ffffff";
}

function readDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* gizli sekme / depolama kapalı: şerit yalnız bu görünümde kapanır */
  }
}

/**
 * Faz 2.9: menünün üstündeki duyuru şeridi. Yalnız duyuru açık + tarih aralığındaysa çizilir;
 * değilse DOM'a hiçbir şey eklenmez. Misafir kapatabilir (bu oturum boyunca; metin değişirse tekrar çıkar).
 */
export function PublicAnnouncementBar({ announcement, scope, language, accentColor, now, className }: Props) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (!announcement || !isAnnouncementLive(announcement, now)) return null;

  const key = announcementDismissKey(announcement, scope);
  // Menü verisi tarayıcıda yüklendikten sonra çizildiği için depolama burada güvenle okunur.
  if (dismissedKey === key || (typeof window !== "undefined" && readDismissed(key))) return null;

  const text = resolveAnnouncementText(announcement, language);
  if (!text) return null;
  const color = readableTextColor(accentColor);
  const closeLabel = pickLang(language, {
    tr: "Duyuruyu kapat",
    en: "Dismiss announcement",
    ru: "Закрыть объявление",
    de: "Hinweis schließen",
    fr: "Fermer l'annonce",
    es: "Cerrar aviso",
    it: "Chiudi avviso",
    uk: "Закрити оголошення",
    zh: "关闭公告",
    az: "Elanı bağla",
  });

  return (
    <div
      data-testid="announcement-bar"
      role="note"
      className={`flex w-full items-start gap-2 px-3 py-2 text-[13px] font-bold leading-snug ${className ?? ""}`}
      style={{ backgroundColor: accentColor, color }}
    >
      <Megaphone size={15} className="mt-0.5 flex-shrink-0" aria-hidden />
      <p className="min-w-0 flex-1 break-words">{text}</p>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={() => {
          writeDismissed(key);
          setDismissedKey(key);
        }}
        className="-my-1 -mr-1 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
