/**
 * Faz 2.1: mekan bilgileri (çalışma saatleri, WhatsApp, sosyal hesaplar, Google yorum linki),
 * ürün rozetleri ve fiyat tarihi için saf yardımcılar. Hem admin hem public menü kullanır.
 * Tarayıcıya giden her bağlantı burada doğrulanır (yalnızca https/http → javascript: vb. reddedilir).
 */

export type MenuLanguage = "tr" | "en" | "ru";

export function pickLang(language: string, text: { tr: string; en: string; ru: string }): string {
  if (language === "en") return text.en;
  if (language === "ru") return text.ru;
  return text.tr;
}

// ---------------------------------------------------------------------------
// Rozetler
// ---------------------------------------------------------------------------
export const PRODUCT_BADGES = [
  { id: "vegan", icon: "🌱", tr: "Vegan", en: "Vegan", ru: "Веган" },
  { id: "vegetarian", icon: "🥬", tr: "Vejetaryen", en: "Vegetarian", ru: "Вегетарианское" },
  { id: "spicy", icon: "🌶️", tr: "Acı", en: "Spicy", ru: "Острое" },
  { id: "new", icon: "✨", tr: "Yeni", en: "New", ru: "Новинка" },
  { id: "chef_pick", icon: "👨‍🍳", tr: "Şef önerisi", en: "Chef's pick", ru: "Выбор шефа" },
  { id: "popular", icon: "🔥", tr: "Popüler", en: "Popular", ru: "Популярное" },
] as const;

export type ProductBadgeId = (typeof PRODUCT_BADGES)[number]["id"];

const BADGE_IDS = new Set<string>(PRODUCT_BADGES.map((b) => b.id));

export function isProductBadgeId(value: unknown): value is ProductBadgeId {
  return typeof value === "string" && BADGE_IDS.has(value);
}

/** Bilinmeyen/yinelenen id'leri atar; tanımlı sıraya göre döner. */
export function normalizeBadgeIds(raw: unknown): ProductBadgeId[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.filter(isProductBadgeId));
  return PRODUCT_BADGES.filter((b) => set.has(b.id)).map((b) => b.id);
}

export function resolveProductBadges(
  raw: unknown,
  language: string
): { id: ProductBadgeId; icon: string; label: string }[] {
  const ids = new Set(normalizeBadgeIds(raw));
  return PRODUCT_BADGES.filter((b) => ids.has(b.id)).map((b) => ({
    id: b.id,
    icon: b.icon,
    label: pickLang(language, b),
  }));
}

// ---------------------------------------------------------------------------
// Bağlantılar
// ---------------------------------------------------------------------------

/** Yalnızca http(s) kabul eder; şemasız "site.com/x" → https://site.com/x. Aksi halde null. */
export function sanitizeHttpUrl(raw: unknown, maxLength = 500): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  if (/[\s<>"']/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** WhatsApp numarasını rakamlara indirger (uluslararası, "+" yok). TR varsayımı: 05xx / 5xx → 90. */
export function normalizeWhatsappNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = `90${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function whatsappUrl(numberDigits: string, message?: string): string {
  const base = `https://wa.me/${numberDigits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const SOCIAL_PLATFORMS = [
  { id: "facebook", label: "Facebook", base: "https://www.facebook.com/", placeholder: "sayfaadi veya facebook.com/…" },
  { id: "tiktok", label: "TikTok", base: "https://www.tiktok.com/@", placeholder: "@kullanici veya tiktok.com/@…" },
  { id: "x", label: "X (Twitter)", base: "https://x.com/", placeholder: "@kullanici veya x.com/…" },
  { id: "youtube", label: "YouTube", base: "https://www.youtube.com/", placeholder: "youtube.com/@kanal" },
  { id: "tripadvisor", label: "TripAdvisor", base: "", placeholder: "tripadvisor.com.tr/…" },
  { id: "spotify", label: "Spotify", base: "", placeholder: "open.spotify.com/…" },
  { id: "website", label: "Web sitesi", base: "", placeholder: "www.siteadi.com" },
] as const;

export type SocialPlatformId = (typeof SOCIAL_PLATFORMS)[number]["id"];
export type SocialLinks = Partial<Record<SocialPlatformId, string>>;

const HANDLE_RE = /^@?[A-Za-z0-9._-]{1,50}$/;

/** Tek bir platform girdisini güvenli URL'ye çevirir (kullanıcı adı veya tam link). */
export function resolveSocialUrl(platformId: SocialPlatformId, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const platform = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
  if (!platform) return null;
  if (platform.base && HANDLE_RE.test(trimmed)) {
    return `${platform.base}${encodeURIComponent(trimmed.replace(/^@/, ""))}`;
  }
  return sanitizeHttpUrl(trimmed);
}

export function resolveSocialLinks(
  raw: unknown
): { id: SocialPlatformId; label: string; url: string }[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
  const record = raw as Record<string, unknown>;
  const out: { id: SocialPlatformId; label: string; url: string }[] = [];
  for (const platform of SOCIAL_PLATFORMS) {
    const url = resolveSocialUrl(platform.id, record[platform.id]);
    if (url) out.push({ id: platform.id, label: platform.label, url });
  }
  return out;
}

/** Kaydetmeden önce: yalnızca bilinen platformlar, kırpılmış, boşlar atılmış. */
export function cleanSocialLinksForSave(raw: SocialLinks): SocialLinks {
  const out: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = raw[platform.id];
    if (typeof value === "string" && value.trim()) out[platform.id] = value.trim().slice(0, 300);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Çalışma saatleri
// ---------------------------------------------------------------------------
export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const WEEK_DAY_LABELS: Record<WeekDay, { tr: string; en: string; ru: string }> = {
  mon: { tr: "Pazartesi", en: "Monday", ru: "Понедельник" },
  tue: { tr: "Salı", en: "Tuesday", ru: "Вторник" },
  wed: { tr: "Çarşamba", en: "Wednesday", ru: "Среда" },
  thu: { tr: "Perşembe", en: "Thursday", ru: "Четверг" },
  fri: { tr: "Cuma", en: "Friday", ru: "Пятница" },
  sat: { tr: "Cumartesi", en: "Saturday", ru: "Суббота" },
  sun: { tr: "Pazar", en: "Sunday", ru: "Воскресенье" },
};

export type DayHours = { closed: boolean; open: string; close: string };
export type OpeningHours = Record<WeekDay, DayHours>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function defaultOpeningHours(): OpeningHours {
  const day: DayHours = { closed: false, open: "09:00", close: "23:00" };
  return {
    mon: { ...day },
    tue: { ...day },
    wed: { ...day },
    thu: { ...day },
    fri: { ...day },
    sat: { ...day },
    sun: { ...day },
  };
}

/** DB'den gelen jsonb'yi doğrular; geçersizse null (menüde saat gösterilmez). */
export function parseOpeningHours(raw: unknown): OpeningHours | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const out = {} as OpeningHours;
  for (const day of WEEK_DAYS) {
    const entry = record[day];
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    const closed = e.closed === true;
    const open = typeof e.open === "string" ? e.open : "";
    const close = typeof e.close === "string" ? e.close : "";
    if (!closed && (!TIME_RE.test(open) || !TIME_RE.test(close))) return null;
    out[day] = { closed, open: TIME_RE.test(open) ? open : "09:00", close: TIME_RE.test(close) ? close : "23:00" };
  }
  return out;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const DAY_BY_INTL_WEEKDAY: Record<string, WeekDay> = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};

/** Verilen anın mekan saat diliminde (varsayılan Türkiye) gün + dakika değeri. */
export function localDayAndMinutes(
  now: Date,
  timeZone = "Europe/Istanbul"
): { day: WeekDay; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { day: DAY_BY_INTL_WEEKDAY[weekday] ?? "mon", minutes: hour * 60 + minute };
}

/** Şu an açık mı? Gece yarısını aşan aralıkları (22:00–02:00) destekler. */
export function isOpenNow(hours: OpeningHours, now: Date, timeZone = "Europe/Istanbul"): boolean {
  const { day, minutes } = localDayAndMinutes(now, timeZone);
  const today = hours[day];
  if (!today.closed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (open === close) return true; // 7/24 gibi (aynı saat) → açık say
    if (close > open) {
      if (minutes >= open && minutes < close) return true;
    } else if (minutes >= open) {
      return true;
    }
  }
  const prevDay = WEEK_DAYS[(WEEK_DAYS.indexOf(day) + 6) % 7];
  const prev = hours[prevDay];
  if (!prev.closed) {
    const open = toMinutes(prev.open);
    const close = toMinutes(prev.close);
    if (close < open && minutes < close) return true;
  }
  return false;
}

export function formatDayHours(day: DayHours, language: string): string {
  if (day.closed) return pickLang(language, { tr: "Kapalı", en: "Closed", ru: "Закрыто" });
  if (day.open === day.close) return pickLang(language, { tr: "24 saat açık", en: "Open 24 hours", ru: "Круглосуточно" });
  return `${day.open} – ${day.close}`;
}

// ---------------------------------------------------------------------------
// Fiyat güncelleme tarihi
// ---------------------------------------------------------------------------
export function latestPriceUpdate(products: { price_updated_at?: string | null }[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const p of products) {
    const raw = p.price_updated_at;
    if (!raw) continue;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestIso = raw;
    }
  }
  return bestIso;
}

export function formatPriceDate(iso: string, language: string, timeZone = "Europe/Istanbul"): string {
  const locale = language === "en" ? "en-GB" : language === "ru" ? "ru-RU" : "tr-TR";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Besin değerleri
// ---------------------------------------------------------------------------
export type Nutrition = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export function readNutrition(record: Record<string, unknown>): Nutrition {
  return {
    calories: numOrNull(record.calories),
    protein_g: numOrNull(record.protein_g),
    carbs_g: numOrNull(record.carbs_g),
    fat_g: numOrNull(record.fat_g),
  };
}

export function hasNutrition(n: Nutrition): boolean {
  return n.calories !== null || n.protein_g !== null || n.carbs_g !== null || n.fat_g !== null;
}

/** Admin formundaki metin alanı → DB değeri (boş = null, geçersiz = undefined). */
export function parseNutritionInput(raw: string, opts: { integer: boolean; max: number }): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > opts.max) return undefined;
  return opts.integer ? Math.round(n) : Math.round(n * 10) / 10;
}
