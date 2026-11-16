/**
 * Faz 2.5b: panelde çevrilebilen öğe türleri ve alanları.
 * Uzunluk sınırları DB CHECK'leriyle (i18n_translations_ok) ve formlardaki sınırlarla uyumludur.
 * İstemci (formlar, çeviri merkezi) ve sunucu (/api/admin/translate) aynı tabloyu kullanır.
 */
export const TRANSLATABLE_KINDS = [
  "product",
  "category",
  "menu",
  "variant",
  "modifier_group",
  "modifier_option",
  "ingredient",
] as const;

export type TranslatableKind = (typeof TRANSLATABLE_KINDS)[number];

export type TranslatableKindInfo = {
  fields: readonly string[];
  /** Alan başına en çok karakter (çeviri) — DB CHECK sınırları / menü formu sınırları. */
  maxLength: Record<string, number>;
  /** AI istemine verilen kısa açıklama. */
  promptHint: string;
};

export const TRANSLATABLE_KIND_INFO: Record<TranslatableKind, TranslatableKindInfo> = {
  product: {
    fields: ["name", "description"],
    maxLength: { name: 4000, description: 4000 },
    promptHint: "menu item (dish or drink): name and description",
  },
  category: {
    fields: ["name", "main_group", "note"],
    maxLength: { name: 1000, main_group: 1000, note: 1000 },
    promptHint: "menu category title (name), the big menu section it belongs to (section_heading, e.g. food, drinks — always translate it) and a short category note",
  },
  menu: {
    fields: ["name", "description"],
    maxLength: { name: 120, description: 500 },
    promptHint: "menu title such as Breakfast Menu, Drinks Menu (name) and its short description",
  },
  variant: {
    fields: ["label"],
    maxLength: { label: 200 },
    promptHint: "portion/size option of a menu item, e.g. Small, Large, 33 cl, Double",
  },
  modifier_group: {
    fields: ["name"],
    maxLength: { name: 80 },
    promptHint: "title of an option group on a menu item, e.g. Choose your sauce, Extras",
  },
  modifier_option: {
    fields: ["name"],
    maxLength: { name: 80 },
    promptHint: "single option inside an option group, e.g. Extra cheese, Ketchup",
  },
  ingredient: {
    fields: ["name"],
    maxLength: { name: 80 },
    promptHint: "single ingredient the guest can ask to remove, e.g. Onion, Pickles",
  },
};

export function isTranslatableKind(value: unknown): value is TranslatableKind {
  return typeof value === "string" && (TRANSLATABLE_KINDS as readonly string[]).includes(value);
}

/** Kayıtta kullanılan alan → sınır haritası. */
export function saveLimits(kind: TranslatableKind): Record<string, number> {
  return TRANSLATABLE_KIND_INFO[kind].maxLength;
}

export function fieldMaxLength(kind: TranslatableKind, field: string): number {
  return TRANSLATABLE_KIND_INFO[kind].maxLength[field] ?? 0;
}
