"use client";

import { useMemo, useState } from "react";
import { Check, Clock, Copy, Info, MessageCircle, Star, Wifi, X } from "lucide-react";
import {
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  formatDayHours,
  formatPriceDate,
  isOpenNow,
  latestPriceUpdate,
  localDayAndMinutes,
  normalizeWhatsappNumber,
  parseOpeningHours,
  pickLang,
  resolveSocialLinks,
  sanitizeHttpUrl,
  whatsappUrl,
} from "@/lib/public-menu/venue-info";

type VenueRestaurant = {
  name?: string | null;
  wifi_name?: string | null;
  wifi_password?: string | null;
  whatsapp_number?: string | null;
  google_review_url?: string | null;
  opening_hours?: unknown;
  social_links?: unknown;
  show_price_date?: boolean | null;
};

type Props = {
  restaurant: VenueRestaurant;
  language: string;
  accentColor: string;
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function PublicVenueActions({ restaurant, language, accentColor }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const hours = useMemo(() => parseOpeningHours(restaurant.opening_hours), [restaurant.opening_hours]);
  const wifiName = clean(restaurant.wifi_name);
  const wifiPassword = clean(restaurant.wifi_password);
  const googleUrl = sanitizeHttpUrl(restaurant.google_review_url);
  const socials = useMemo(() => resolveSocialLinks(restaurant.social_links), [restaurant.social_links]);
  const whatsapp = normalizeWhatsappNumber(restaurant.whatsapp_number);

  const hasInfo = Boolean(hours || wifiName || wifiPassword || googleUrl || socials.length > 0);
  if (!hasInfo && !whatsapp) return null;

  const openNow = hours && now ? isOpenNow(hours, now) : null;
  const today = now ? localDayAndMinutes(now).day : null;

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(wifiPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* pano erişimi yoksa şifre ekranda görünür kalır */
    }
  };

  const infoLabel = pickLang(language, { tr: "Mekan bilgileri", en: "Venue info", ru: "О заведении" });
  const waLabel = pickLang(language, { tr: "WhatsApp ile yazın", en: "Message us on WhatsApp", ru: "Написать в WhatsApp" });

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {hasInfo ? (
          <button
            type="button"
            onClick={() => {
              setNow(new Date());
              setOpen(true);
            }}
            aria-label={infoLabel}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg shadow-black/25 transition active:scale-95"
            style={{ backgroundColor: accentColor }}
          >
            <Info size={22} aria-hidden />
          </button>
        ) : (
          <span />
        )}
        {whatsapp ? (
          <a
            href={whatsappUrl(whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={waLabel}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition active:scale-95"
          >
            <MessageCircle size={22} aria-hidden />
          </a>
        ) : null}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={infoLabel}
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 text-gray-900 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black">{restaurant.name || infoLabel}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={pickLang(language, { tr: "Kapat", en: "Close", ru: "Закрыть" })}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-700"
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            {hours ? (
              <section className="mb-5">
                <div className="mb-2 flex items-center gap-2">
                  <Clock size={16} aria-hidden />
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    {pickLang(language, { tr: "Çalışma saatleri", en: "Opening hours", ru: "Часы работы" })}
                  </h3>
                  {openNow !== null ? (
                    <span
                      className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                        openNow ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {openNow
                        ? pickLang(language, { tr: "Şu an açık", en: "Open now", ru: "Открыто" })
                        : pickLang(language, { tr: "Şu an kapalı", en: "Closed now", ru: "Закрыто" })}
                    </span>
                  ) : null}
                </div>
                <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 text-sm">
                  {WEEK_DAYS.map((day) => (
                    <li
                      key={day}
                      className={`flex justify-between px-3 py-2 ${today === day ? "bg-gray-50 font-black" : ""}`}
                    >
                      <span>{pickLang(language, WEEK_DAY_LABELS[day])}</span>
                      <span>{formatDayHours(hours[day], language)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {wifiName || wifiPassword ? (
              <section className="mb-5">
                <div className="mb-2 flex items-center gap-2">
                  <Wifi size={16} aria-hidden />
                  <h3 className="text-sm font-black uppercase tracking-wide">Wi-Fi</h3>
                </div>
                <div className="space-y-1 rounded-2xl border border-gray-100 px-3 py-2 text-sm">
                  {wifiName ? (
                    <p>
                      <span className="text-gray-500">{pickLang(language, { tr: "Ağ", en: "Network", ru: "Сеть" })}: </span>
                      <span className="font-bold">{wifiName}</span>
                    </p>
                  ) : null}
                  {wifiPassword ? (
                    <div className="flex items-center justify-between gap-2">
                      <p>
                        <span className="text-gray-500">{pickLang(language, { tr: "Şifre", en: "Password", ru: "Пароль" })}: </span>
                        <span className="break-all font-mono font-bold">{wifiPassword}</span>
                      </p>
                      <button
                        type="button"
                        onClick={copyPassword}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-bold"
                      >
                        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                        {copied
                          ? pickLang(language, { tr: "Kopyalandı", en: "Copied", ru: "Скопировано" })
                          : pickLang(language, { tr: "Kopyala", en: "Copy", ru: "Копировать" })}
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {googleUrl ? (
              <a
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-5 flex items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 px-4 py-3 text-sm font-black"
              >
                <Star size={18} className="text-amber-500" aria-hidden />
                {pickLang(language, {
                  tr: "Google'da değerlendirin",
                  en: "Rate us on Google",
                  ru: "Оцените нас в Google",
                })}
              </a>
            ) : null}

            {socials.length > 0 ? (
              <section>
                <div className="flex flex-wrap gap-2">
                  {socials.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-gray-100 px-3.5 py-2 text-xs font-black"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PublicPriceDateNote({
  products,
  show,
  language,
  className = "",
}: {
  products: { price_updated_at?: string | null }[];
  show: boolean | null | undefined;
  language: string;
  className?: string;
}) {
  if (!show) return null;
  const latest = latestPriceUpdate(products);
  if (!latest) return null;
  const date = formatPriceDate(latest, language);
  return (
    <p className={`px-4 pb-20 pt-2 text-center text-[11px] font-semibold opacity-60 ${className}`}>
      {pickLang(language, {
        tr: `Fiyatlar en son ${date} tarihinde güncellenmiştir.`,
        en: `Prices last updated on ${date}.`,
        ru: `Цены обновлены: ${date}.`,
      })}
    </p>
  );
}
