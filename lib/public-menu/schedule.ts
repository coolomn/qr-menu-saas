/**
 * Faz 2.3: menü / kategori / ürün zamanlaması (kahvaltı, öğle, akşam, kampanya tarihleri).
 *
 * Saf yardımcılar; hem admin (düzenleyici) hem müşteri menüsü (değerlendirme) kullanır.
 * Karar (kullanıcı, 2026-11-16): zaman dışındayken içerik varsayılan olarak GÖRÜNÜR kalır
 * ("Şu an servis dışı" etiketiyle soluk); işletme isterse "gizle" seçebilir.
 *
 * Saklama: DB'de `schedule jsonb` (NULL = her zaman). Biçim:
 *   { starts_on?: "YYYY-MM-DD", ends_on?: "YYYY-MM-DD",
 *     windows?: [{ days: [0..6], start: "HH:MM" | null, end: "HH:MM" | null }],
 *     outside: "show" | "hide" }
 * - days: 0 = Pazar … 6 = Cumartesi (JS getDay ile aynı).
 * - start/end ikisi de null (ya da eşit) = o günler tüm gün.
 * - end < start = gece yarısını aşan aralık (22:00–02:00); sonraki günün sabahı da kapsanır.
 * - windows boşsa yalnızca tarih aralığı geçerlidir; ikisi de yoksa zamanlama yoktur (null).
 * - Tüm saatler mekan saat diliminde (varsayılan Europe/Istanbul) değerlendirilir.
 */

import { pickLang } from "@/lib/public-menu/venue-info";

export type ScheduleOutsideMode = "show" | "hide";

export type ScheduleWindow = {
  days: number[];
  start: string | null;
  end: string | null;
};

export type Schedule = {
  starts_on: string | null;
  ends_on: string | null;
  windows: ScheduleWindow[];
  outside: ScheduleOutsideMode;
};

export const DEFAULT_SCHEDULE_TIMEZONE = "Europe/Istanbul";
const MAX_WINDOWS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------------------
// Doğrulama / normalleştirme
// ---------------------------------------------------------------------------

function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function normalizeWindow(raw: unknown): ScheduleWindow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.days)) return null;
  const days = [...new Set(r.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b
  );
  if (days.length === 0) return null;

  const hasStart = typeof r.start === "string" && TIME_RE.test(r.start);
  const hasEnd = typeof r.end === "string" && TIME_RE.test(r.end);
  if (hasStart !== hasEnd) return null; // yarım aralık geçersiz
  if (!hasStart) return { days, start: null, end: null };
  const start = r.start as string;
  const end = r.end as string;
  if (start === end) return { days, start: null, end: null }; // aynı saat = tüm gün
  return { days, start, end };
}

/** Ham değeri (DB/JSON) doğrular. Geçersiz ya da boşsa null = "her zaman". */
export function parseSchedule(raw: unknown): Schedule | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  let starts_on = isValidDateString(r.starts_on) ? r.starts_on : null;
  let ends_on = isValidDateString(r.ends_on) ? r.ends_on : null;
  if (starts_on && ends_on && ends_on < starts_on) {
    [starts_on, ends_on] = [ends_on, starts_on];
  }

  const windows = Array.isArray(r.windows)
    ? r.windows
        .slice(0, MAX_WINDOWS)
        .map(normalizeWindow)
        .filter((w): w is ScheduleWindow => w !== null)
    : [];

  if (!starts_on && !ends_on && windows.length === 0) return null;

  return {
    starts_on,
    ends_on,
    windows,
    outside: r.outside === "hide" ? "hide" : "show",
  };
}

/** Kaydetmeden önce admin değerini temizler (parseSchedule ile aynı kurallar). */
export function sanitizeScheduleForSave(value: unknown): Schedule | null {
  return parseSchedule(value);
}

export function emptyScheduleDraft(): Schedule {
  return { starts_on: null, ends_on: null, windows: [], outside: "show" };
}

// ---------------------------------------------------------------------------
// Yerel zaman
// ---------------------------------------------------------------------------

const DOW_BY_INTL: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type LocalNow = { date: string; dow: number; minutes: number };

export function localNow(now: Date, timeZone = DEFAULT_SCHEDULE_TIMEZONE): LocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    dow: DOW_BY_INTL[get("weekday")] ?? 0,
    minutes: hour * 60 + Number(get("minute")),
  };
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function dowOfDate(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function dateInRange(schedule: Schedule, date: string): boolean {
  if (schedule.starts_on && date < schedule.starts_on) return false;
  if (schedule.ends_on && date > schedule.ends_on) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Değerlendirme
// ---------------------------------------------------------------------------

export type ScheduleNext = { date: string; minutes: number };

export type ScheduleState = {
  /** Şu an servis içinde mi (zamanlama yoksa her zaman true). */
  available: boolean;
  outside: ScheduleOutsideMode;
  /** Servis dışındaysa: tarih aralığı bitti mi (bir daha açılmaz)? */
  ended: boolean;
  /** Servis dışındaysa bir sonraki başlangıç (bulunamazsa null). */
  next: ScheduleNext | null;
};

function isActiveAt(schedule: Schedule, date: string, dow: number, minutes: number): boolean {
  if (schedule.windows.length === 0) return dateInRange(schedule, date);

  const prevDate = addDays(date, -1);
  const prevDow = (dow + 6) % 7;

  for (const w of schedule.windows) {
    if (w.start === null || w.end === null) {
      if (w.days.includes(dow) && dateInRange(schedule, date)) return true;
      continue;
    }
    const s = timeToMinutes(w.start);
    const e = timeToMinutes(w.end);
    if (s < e) {
      if (w.days.includes(dow) && minutes >= s && minutes < e && dateInRange(schedule, date)) return true;
    } else {
      // gece yarısını aşan: başlangıç günü akşamı + ertesi gün sabahı
      if (w.days.includes(dow) && minutes >= s && dateInRange(schedule, date)) return true;
      if (w.days.includes(prevDow) && minutes < e && dateInRange(schedule, prevDate)) return true;
    }
  }
  return false;
}

function findNext(schedule: Schedule, current: LocalNow): ScheduleNext | null {
  // İlk uygun günün en erken başlangıcı; en fazla ~13 ay ileri bakılır.
  for (let offset = 0; offset <= 400; offset += 1) {
    const date = addDays(current.date, offset);
    if (schedule.ends_on && date > schedule.ends_on) return null;
    if (!dateInRange(schedule, date)) continue;

    if (schedule.windows.length === 0) {
      // Yalnızca tarih aralığı: aralık başlayınca gün başında açılır.
      if (offset > 0) return { date, minutes: 0 };
      continue;
    }

    const dow = dowOfDate(date);
    let earliest: number | null = null;
    for (const w of schedule.windows) {
      if (!w.days.includes(dow)) continue;
      const startMinutes = w.start === null ? 0 : timeToMinutes(w.start);
      if (offset === 0 && startMinutes <= current.minutes) continue;
      if (earliest === null || startMinutes < earliest) earliest = startMinutes;
    }
    if (earliest !== null) return { date, minutes: earliest };
  }
  return null;
}

function dayDiff(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function evaluateSchedule(
  schedule: Schedule | null,
  now: Date,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): ScheduleState {
  if (!schedule) return { available: true, outside: "show", ended: false, next: null };

  const current = localNow(now, timeZone);
  if (isActiveAt(schedule, current.date, current.dow, current.minutes)) {
    return { available: true, outside: schedule.outside, ended: false, next: null };
  }
  const ended = Boolean(schedule.ends_on && current.date > schedule.ends_on);
  return {
    available: false,
    outside: schedule.outside,
    ended,
    next: ended ? null : findNext(schedule, current),
  };
}

// ---------------------------------------------------------------------------
// Menü > kategori > ürün birleşimi
// ---------------------------------------------------------------------------

export type ScheduleLevel = "menu" | "category" | "product";

export type ServiceInput = { level: ScheduleLevel; schedule: Schedule | null };

export type ServiceResolution = {
  /** false = müşteriye hiç gösterilmez ("gizle" modunda zaman dışı). */
  visible: boolean;
  /** Gösteriliyorsa ama servis dışıysa: en özel seviyedeki zamanlama. */
  outside: { level: ScheduleLevel; schedule: Schedule; state: ScheduleState } | null;
};

const LEVEL_PRIORITY: ScheduleLevel[] = ["product", "category", "menu"];

export function resolveService(
  inputs: ServiceInput[],
  now: Date,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): ServiceResolution {
  let outside: ServiceResolution["outside"] = null;
  const ordered = [...inputs].sort((a, b) => LEVEL_PRIORITY.indexOf(a.level) - LEVEL_PRIORITY.indexOf(b.level));

  for (const input of ordered) {
    if (!input.schedule) continue;
    const state = evaluateSchedule(input.schedule, now, timeZone);
    if (state.available) continue;
    if (state.outside === "hide") return { visible: false, outside: null };
    if (!outside) outside = { level: input.level, schedule: input.schedule, state };
  }
  return { visible: true, outside };
}

// ---------------------------------------------------------------------------
// Metinler (TR / EN / RU)
// ---------------------------------------------------------------------------

const DAY_NAMES = {
  tr: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
} as const;

function dayNames(language: string): readonly string[] {
  if (language === "en") return DAY_NAMES.en;
  if (language === "ru") return DAY_NAMES.ru;
  return DAY_NAMES.tr;
}

function sameDays(days: number[], target: number[]): boolean {
  return days.length === target.length && target.every((d) => days.includes(d));
}

function describeDays(days: number[], language: string): string {
  if (days.length === 7) return pickLang(language, { tr: "Her gün", en: "Every day", ru: "Ежедневно" });
  if (sameDays(days, [1, 2, 3, 4, 5])) return pickLang(language, { tr: "Hafta içi", en: "Weekdays", ru: "По будням" });
  if (sameDays(days, [0, 6])) return pickLang(language, { tr: "Hafta sonu", en: "Weekends", ru: "По выходным" });
  const names = dayNames(language);
  // Pazartesi'den başlayan sıra
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  return ordered.map((d) => names[d]).join(", ");
}

function formatDateLabel(date: string, language: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const locale = language === "en" ? "en-GB" : language === "ru" ? "ru-RU" : "tr-TR";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/** "Her gün 11:00–16:00 · 1 Mar – 5 Mar" gibi kısa özet (zamanlama yoksa boş metin). */
export function describeSchedule(schedule: Schedule | null, language: string): string {
  if (!schedule) return "";
  const parts: string[] = [];

  for (const w of schedule.windows) {
    const days = describeDays(w.days, language);
    const time =
      w.start === null || w.end === null
        ? pickLang(language, { tr: "tüm gün", en: "all day", ru: "весь день" })
        : `${w.start}–${w.end}`;
    parts.push(`${days} ${time}`);
  }

  if (schedule.starts_on && schedule.ends_on) {
    parts.push(`${formatDateLabel(schedule.starts_on, language)} – ${formatDateLabel(schedule.ends_on, language)}`);
  } else if (schedule.starts_on) {
    parts.push(
      pickLang(language, {
        tr: `${formatDateLabel(schedule.starts_on, language)} tarihinden itibaren`,
        en: `From ${formatDateLabel(schedule.starts_on, language)}`,
        ru: `С ${formatDateLabel(schedule.starts_on, language)}`,
      })
    );
  } else if (schedule.ends_on) {
    parts.push(
      pickLang(language, {
        tr: `${formatDateLabel(schedule.ends_on, language)} tarihine kadar`,
        en: `Until ${formatDateLabel(schedule.ends_on, language)}`,
        ru: `До ${formatDateLabel(schedule.ends_on, language)}`,
      })
    );
  }
  return parts.join(" · ");
}

function formatMinutes(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** "Şu an servis dışı · Yarın 11:00'de başlar" */
export function describeOutside(
  state: ScheduleState,
  language: string,
  now: Date,
  timeZone = DEFAULT_SCHEDULE_TIMEZONE
): string {
  const base = pickLang(language, {
    tr: "Şu an servis dışı",
    en: "Not served right now",
    ru: "Сейчас не подаётся",
  });
  if (state.ended) {
    return `${base} · ${pickLang(language, { tr: "Sona erdi", en: "Ended", ru: "Завершено" })}`;
  }
  if (!state.next) return base;

  const today = localNow(now, timeZone).date;
  const diff = dayDiff(today, state.next.date);
  const time = formatMinutes(state.next.minutes);
  let when: string;
  if (diff === 0) {
    when = pickLang(language, { tr: `${time}'de başlar`, en: `starts at ${time}`, ru: `начнётся в ${time}` });
  } else if (diff === 1) {
    when = pickLang(language, {
      tr: `Yarın ${time}'de başlar`,
      en: `starts tomorrow at ${time}`,
      ru: `начнётся завтра в ${time}`,
    });
  } else if (diff < 7) {
    const day = dayNames(language)[dowOfDate(state.next.date)];
    when = pickLang(language, {
      tr: `${day} ${time}'de başlar`,
      en: `starts ${day} at ${time}`,
      ru: `начнётся ${day} в ${time}`,
    });
  } else {
    const date = formatDateLabel(state.next.date, language);
    when = pickLang(language, {
      tr: `${date} tarihinde başlar`,
      en: `starts ${date}`,
      ru: `начнётся ${date}`,
    });
  }
  return `${base} · ${when}`;
}
