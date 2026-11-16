/**
 * Faz 2.5: menü dilleri. TR ana dildir (içerik name/description… kolonlarında),
 * diğerleri satırların `translations` jsonb'sinde tutulur.
 * Bu liste DB'deki public.i18n_allowed_languages() ile AYNI olmalıdır (+ 'tr').
 */
export const MENU_LANGUAGES = ["tr", "en", "ru", "de", "fr", "es", "it", "uk", "zh", "az"] as const;

export type MenuLanguage = (typeof MENU_LANGUAGES)[number];
export type TranslationLanguage = Exclude<MenuLanguage, "tr">;

export const TRANSLATION_LANGUAGES = MENU_LANGUAGES.filter(
  (l): l is TranslationLanguage => l !== "tr"
);

/** Mevcut müşterilerin bugünkü görünümü; DB varsayılanıyla aynı. */
export const DEFAULT_MENU_LANGUAGES: MenuLanguage[] = ["tr", "en", "ru"];

export type LanguageInfo = {
  /** Dil seçicide görünen kısa kod. */
  short: string;
  /** Kendi dilindeki adı (müşteri seçicisi). */
  nativeName: string;
  /** Türkçe adı (panel). */
  turkishName: string;
  /** Intl tarih/sayı biçimi. */
  intl: string;
};

export const LANGUAGE_INFO: Record<MenuLanguage, LanguageInfo> = {
  tr: { short: "TR", nativeName: "Türkçe", turkishName: "Türkçe", intl: "tr-TR" },
  en: { short: "EN", nativeName: "English", turkishName: "İngilizce", intl: "en-GB" },
  ru: { short: "RU", nativeName: "Русский", turkishName: "Rusça", intl: "ru-RU" },
  de: { short: "DE", nativeName: "Deutsch", turkishName: "Almanca", intl: "de-DE" },
  fr: { short: "FR", nativeName: "Français", turkishName: "Fransızca", intl: "fr-FR" },
  es: { short: "ES", nativeName: "Español", turkishName: "İspanyolca", intl: "es-ES" },
  it: { short: "IT", nativeName: "Italiano", turkishName: "İtalyanca", intl: "it-IT" },
  uk: { short: "UA", nativeName: "Українська", turkishName: "Ukraynaca", intl: "uk-UA" },
  zh: { short: "中文", nativeName: "中文", turkishName: "Çince", intl: "zh-CN" },
  az: { short: "AZ", nativeName: "Azərbaycanca", turkishName: "Azerbaycanca", intl: "az-AZ" },
};

const LANGUAGE_SET = new Set<string>(MENU_LANGUAGES);

export function isMenuLanguage(value: unknown): value is MenuLanguage {
  return typeof value === "string" && LANGUAGE_SET.has(value);
}

/** Bilinmeyen değerde "tr". */
export function toMenuLanguage(value: unknown): MenuLanguage {
  return isMenuLanguage(value) ? value : "tr";
}

export function intlLocale(language: string): string {
  return LANGUAGE_INFO[toMenuLanguage(language)].intl;
}

/**
 * DB'den gelen restaurants.menu_languages → güvenli liste.
 * 'tr' her zaman ilk sırada; bilinmeyen/yinelenen atılır; boş/yoksa varsayılan.
 */
export function normalizeMenuLanguages(raw: unknown): MenuLanguage[] {
  if (!Array.isArray(raw)) return [...DEFAULT_MENU_LANGUAGES];
  const seen = new Set<MenuLanguage>(["tr"]);
  const out: MenuLanguage[] = ["tr"];
  for (const value of raw) {
    if (isMenuLanguage(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** 10 dilin hepsi zorunlu: eksik çeviri derleme hatası verir. */
export type LocalizedString = Record<MenuLanguage, string>;

export function pickLang(language: string, text: LocalizedString): string {
  return text[toMenuLanguage(language)];
}

/** "de-AT" → "de"; "zh-Hans-CN" → "zh". */
function baseLanguageTag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * Müşteri menüsü açılış dili: URL (?lang=) > daha önce seçilen > tarayıcı dili > TR.
 * Yalnız işletmenin açtığı diller seçilebilir.
 */
export function pickInitialMenuLanguage(
  available: readonly MenuLanguage[],
  options: {
    urlLang?: string | null;
    storedLang?: string | null;
    browserLanguages?: readonly string[] | null;
  }
): MenuLanguage {
  const allowed = new Set<string>(available);
  const urlLang = options.urlLang ? baseLanguageTag(options.urlLang) : "";
  if (allowed.has(urlLang)) return urlLang as MenuLanguage;
  const stored = options.storedLang ? baseLanguageTag(options.storedLang) : "";
  if (allowed.has(stored)) return stored as MenuLanguage;
  for (const tag of options.browserLanguages ?? []) {
    const base = baseLanguageTag(tag);
    if (allowed.has(base)) return base as MenuLanguage;
  }
  return "tr";
}
