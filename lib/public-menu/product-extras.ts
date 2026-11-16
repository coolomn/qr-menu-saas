/**
 * Faz 2.4: seçenek grupları (modifier), çıkarılabilir malzemeler, "yanında iyi gider" önerileri.
 * Sipariş sistemi yok: bunlar müşteriye yalnız bilgi olarak gösterilir.
 *
 * Menü JSON'u küçük kalsın diye gruplar menü düzeyinde bir kez gönderilir; ürünler yalnız
 * grup / önerilen ürün id'lerini taşır.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePriceForDisplay } from "@/lib/format-price";

export const MAX_REMOVABLE_INGREDIENTS = 30;
export const MAX_PRODUCT_PAIRINGS = 8;
export const MAX_GROUPS_PER_PRODUCT = 10;
export const MAX_OPTIONS_PER_GROUP = 40;
export const MODIFIER_NAME_MAX = 80;

export type RemovableIngredient = {
  name: string;
  name_en?: string | null;
  name_ru?: string | null;
};

export type PublicModifierOption = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  price_delta: string;
  calories: number | null;
};

export type PublicModifierGroup = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  min_select: number;
  /** null = sınırsız */
  max_select: number | null;
  options: PublicModifierOption[];
};

export type ProductExtras = {
  /** Yalnız en az bir ürüne bağlı ve en az bir aktif seçeneği olan gruplar. */
  groups: PublicModifierGroup[];
  groupIdsByProduct: Map<string, string[]>;
  pairingIdsByProduct: Map<string, string[]>;
};

const EMPTY_EXTRAS = (): ProductExtras => ({
  groups: [],
  groupIdsByProduct: new Map(),
  pairingIdsByProduct: new Map(),
});

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function optStr(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function isSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "42P01") return true;
  return /column|relation|schema cache|does not exist/i.test(error.message || "");
}

/** products.removable_ingredients ham değerini güvenli listeye çevirir. */
export function parseRemovableIngredients(raw: unknown): RemovableIngredient[] {
  if (!Array.isArray(raw)) return [];
  const out: RemovableIngredient[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const name = str(row.name).slice(0, MODIFIER_NAME_MAX);
    if (!name) continue;
    out.push({
      name,
      name_en: optStr(row.name_en)?.slice(0, MODIFIER_NAME_MAX) ?? null,
      name_ru: optStr(row.name_ru)?.slice(0, MODIFIER_NAME_MAX) ?? null,
    });
    if (out.length >= MAX_REMOVABLE_INGREDIENTS) break;
  }
  return out;
}

function toOption(raw: unknown): PublicModifierOption | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const id = str(row.id);
  const name = str(row.name);
  if (!id || !name) return null;
  const calories = int(row.calories);
  return {
    id,
    name,
    name_en: optStr(row.name_en),
    name_ru: optStr(row.name_ru),
    price_delta: str(row.price_delta),
    calories: calories != null && calories >= 0 ? calories : null,
  };
}

/** API / client tarafında grup listesini doğrular (bozuk satırlar atılır). */
export function normalizePublicModifierGroups(raw: unknown): PublicModifierGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicModifierGroup[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const id = str(row.id);
    const name = str(row.name);
    if (!id || !name) continue;
    const options = Array.isArray(row.options)
      ? row.options.map(toOption).filter((o): o is PublicModifierOption => o !== null)
      : [];
    if (options.length === 0) continue;
    const min = int(row.min_select);
    const max = int(row.max_select);
    out.push({
      id,
      name,
      name_en: optStr(row.name_en),
      name_ru: optStr(row.name_ru),
      min_select: min != null && min > 0 ? min : 0,
      max_select: max != null && max > 0 ? max : null,
      options,
    });
  }
  return out;
}

function pickLangText(language: string, item: { name: string; name_en?: string | null; name_ru?: string | null }) {
  if (language === "en" && str(item.name_en)) return str(item.name_en);
  if (language === "ru" && str(item.name_ru)) return str(item.name_ru);
  return item.name;
}

export { pickLangText as modifierText };

/**
 * Grubun seçim kuralını müşteriye okunur metne çevirir.
 * min=max=1 → "1 seçin"; max yalnız → "en fazla 3"; min yalnız → "en az 1"; ikisi yok → "isteğe bağlı".
 */
export function describeSelectionRule(
  group: Pick<PublicModifierGroup, "min_select" | "max_select">,
  language: string
): string {
  const min = group.min_select > 0 ? group.min_select : 0;
  const max = group.max_select != null && group.max_select > 0 ? group.max_select : null;
  const t = (tr: string, en: string, ru: string) => (language === "en" ? en : language === "ru" ? ru : tr);

  if (min > 0 && max === min) return t(`${min} seçin`, `Choose ${min}`, `Выберите ${min}`);
  if (min > 0 && max != null)
    return t(`${min}–${max} arası seçin`, `Choose ${min}–${max}`, `Выберите ${min}–${max}`);
  if (min > 0) return t(`en az ${min} seçin`, `Choose at least ${min}`, `Выберите не менее ${min}`);
  if (max != null) return t(`en fazla ${max}`, `Up to ${max}`, `До ${max}`);
  return t("isteğe bağlı", "Optional", "По желанию");
}

/** Seçenek fiyat farkı: "+15" / "15" / "15 TL" → "+15₺"; boş ya da sıfır → "". */
export function formatPriceDelta(raw: string | null | undefined): string {
  const parsed = parsePriceForDisplay(raw);
  if (!parsed) return "";
  let amount = parsed.amount.replace(/^\+\s*/, "");
  const negative = amount.startsWith("-");
  if (negative) amount = amount.replace(/^-\s*/, "");
  if (!amount || /^0+([.,]0+)?$/.test(amount)) return "";
  return `${negative ? "−" : "+"}${amount}${parsed.currency}`;
}

/** Ürünlere eklenen alanlar (boşsa alan eklenmez: eski menü JSON'u aynen kalır). */
export function attachProductExtras<T extends { id: string }>(
  products: T[],
  extras: ProductExtras,
  visibleProductIds: Set<string>
): (T & { modifier_group_ids?: string[]; pairing_ids?: string[] })[] {
  const groupIds = new Set(extras.groups.map((g) => g.id));
  return products.map((product) => {
    const mg = (extras.groupIdsByProduct.get(product.id) ?? []).filter((id) => groupIds.has(id));
    const pr = (extras.pairingIdsByProduct.get(product.id) ?? []).filter(
      (id) => id !== product.id && visibleProductIds.has(id)
    );
    if (mg.length === 0 && pr.length === 0) return product;
    return {
      ...product,
      ...(mg.length > 0 ? { modifier_group_ids: mg } : {}),
      ...(pr.length > 0 ? { pairing_ids: pr.slice(0, MAX_PRODUCT_PAIRINGS) } : {}),
    };
  });
}

type LinkRow = { product_id: string; sort_order: number | null };

function groupLinks<R extends LinkRow>(rows: R[], key: (r: R) => string): Map<string, string[]> {
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const map = new Map<string, string[]>();
  for (const r of sorted) {
    const list = map.get(r.product_id) ?? [];
    list.push(key(r));
    map.set(r.product_id, list);
  }
  return map;
}

/**
 * Menü için seçenek grupları + bağlantıları toplu yükler (service role).
 * Migration uygulanmadıysa (tablo yok) boş döner: menü eskisi gibi çalışır.
 */
export async function loadProductExtras(
  supabase: SupabaseClient,
  restaurantId: string,
  productIds: string[]
): Promise<ProductExtras> {
  if (productIds.length === 0) return EMPTY_EXTRAS();

  const [links, pairings, groups, options] = await Promise.all([
    supabase
      .from("product_modifier_groups")
      .select("product_id, group_id, sort_order")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("product_pairings")
      .select("product_id, paired_product_id, sort_order")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("modifier_groups")
      .select("id, name, name_en, name_ru, min_select, max_select, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("modifier_options")
      .select("id, group_id, name, name_en, name_ru, price_delta, calories, sort_order")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const firstError = links.error || pairings.error || groups.error || options.error;
  if (firstError) {
    if (isSchemaError(firstError)) return EMPTY_EXTRAS();
    console.error("product extras load failed:", firstError.message);
    return EMPTY_EXTRAS();
  }

  const productSet = new Set(productIds);
  const linkRows = ((links.data ?? []) as { product_id: string; group_id: string; sort_order: number | null }[])
    .filter((r) => productSet.has(r.product_id));
  const pairingRows = ((pairings.data ?? []) as {
    product_id: string;
    paired_product_id: string;
    sort_order: number | null;
  }[]).filter((r) => productSet.has(r.product_id));

  const usedGroupIds = new Set(linkRows.map((r) => r.group_id));
  const optionsByGroup = new Map<string, unknown[]>();
  for (const o of (options.data ?? []) as { group_id: string }[]) {
    if (!usedGroupIds.has(o.group_id)) continue;
    const list = optionsByGroup.get(o.group_id) ?? [];
    if (list.length < MAX_OPTIONS_PER_GROUP) list.push(o);
    optionsByGroup.set(o.group_id, list);
  }

  const publicGroups = normalizePublicModifierGroups(
    ((groups.data ?? []) as { id: string }[])
      .filter((g) => usedGroupIds.has(g.id))
      .map((g) => ({ ...g, options: optionsByGroup.get(g.id) ?? [] }))
  );

  return {
    groups: publicGroups,
    groupIdsByProduct: groupLinks(linkRows, (r) => r.group_id),
    pairingIdsByProduct: groupLinks(pairingRows, (r) => r.paired_product_id),
  };
}
