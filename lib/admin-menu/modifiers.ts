/**
 * Faz 2.4 yönetim tarafı: seçenek grupları (işletme düzeyi), ürün ↔ grup bağlantıları,
 * "yanında iyi gider" bağlantıları, çıkarılabilir malzemeler.
 * Yazımlar tarayıcıdaki Supabase istemcisiyle yapılır; RLS işletme sahipliğini, tetikleyiciler
 * aynı işletme kuralını zorunlu kılar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanTranslationsForSave, legacyColumnsFromTranslations, translationsFromRow } from "@/lib/i18n/edit-translations";
import { parseTranslations, type TranslationMap } from "@/lib/i18n/translations";
import {
  MAX_GROUPS_PER_PRODUCT,
  MAX_OPTIONS_PER_GROUP,
  MAX_PRODUCT_PAIRINGS,
  MAX_REMOVABLE_INGREDIENTS,
  MODIFIER_NAME_MAX,
  type RemovableIngredient,
} from "@/lib/public-menu/product-extras";

export type AdminModifierOption = {
  id?: string;
  name: string;
  /** Faz 2.5b: tüm diller ({ "en": { "name": "…" } }); eski name_en/name_ru tetikleyiciyle eşitlenir. */
  translations: TranslationMap;
  price_delta: string;
  calories: string;
  is_active: boolean;
};

export type AdminModifierGroup = {
  id?: string;
  name: string;
  translations: TranslationMap;
  /** Form değeri: "" = sınır yok */
  min_select: string;
  max_select: string;
  options: AdminModifierOption[];
  /** Listede gösterim: kaç ürüne bağlı */
  product_count?: number;
};

export const emptyModifierOption = (): AdminModifierOption => ({
  name: "",
  translations: {},
  price_delta: "",
  calories: "",
  is_active: true,
});

export const emptyModifierGroup = (): AdminModifierGroup => ({
  name: "",
  translations: {},
  min_select: "",
  max_select: "",
  options: [emptyModifierOption()],
});

function parseIntField(raw: string): number | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return "invalid";
  return Number(s);
}

function translatedNames(map: TranslationMap | undefined): string[] {
  return Object.values(map ?? {}).map((fields) => fields?.name ?? "");
}

const NAME_LIMIT = { name: MODIFIER_NAME_MAX };

/** Kaydetmeden önce form doğrulaması; hata metni ya da null. */
export function validateModifierGroup(group: AdminModifierGroup): string | null {
  const name = group.name.trim();
  if (!name) return "Grup adı boş olamaz.";
  if ([group.name, ...translatedNames(group.translations)].some((v) => v.trim().length > MODIFIER_NAME_MAX)) {
    return `Grup adı en fazla ${MODIFIER_NAME_MAX} karakter olabilir.`;
  }
  const options = group.options.filter((o) => o.name.trim() || o.price_delta.trim() || o.calories.trim());
  if (options.length === 0) return "En az bir seçenek ekleyin.";
  if (options.length > MAX_OPTIONS_PER_GROUP) return `Bir grupta en fazla ${MAX_OPTIONS_PER_GROUP} seçenek olabilir.`;
  for (const o of options) {
    if (!o.name.trim()) return "Her seçeneğin bir adı olmalı.";
    if ([o.name, ...translatedNames(o.translations)].some((v) => v.trim().length > MODIFIER_NAME_MAX)) {
      return `Seçenek adı en fazla ${MODIFIER_NAME_MAX} karakter olabilir.`;
    }
    if (o.price_delta.trim().length > 20) return "Fiyat farkı çok uzun.";
    if (o.price_delta.trim() && !/^[+-]?\s*\d+([.,]\d{1,2})?\s*(₺|TL)?$/i.test(o.price_delta.trim())) {
      return `"${o.name.trim()}" için fiyat farkı geçersiz. Örnek: 15 veya +15`;
    }
    const kcal = parseIntField(o.calories);
    if (kcal === "invalid" || (kcal != null && kcal > 10000)) {
      return `"${o.name.trim()}" için kalori yalnızca sayı olmalı (en çok 10000).`;
    }
  }
  const min = parseIntField(group.min_select);
  const max = parseIntField(group.max_select);
  if (min === "invalid" || max === "invalid") return "Seçim sayıları yalnızca tam sayı olmalı.";
  if (min != null && min > 50) return "En az seçim sayısı çok büyük.";
  if (max != null && (max < 1 || max > 50)) return "En fazla seçim 1 ile 50 arasında olmalı.";
  if (min != null && max != null && max < min) return "En fazla seçim, en az seçimden küçük olamaz.";
  const activeCount = options.filter((o) => o.is_active).length;
  if (min != null && min > activeCount) return "En az seçim sayısı, açık seçenek sayısından fazla olamaz.";
  return null;
}

/** Fiyat farkını tek biçime getirir: "15 TL" → "+15", "-5" → "-5", "" → "". */
export function normalizePriceDelta(raw: string): string {
  const s = raw.trim().replace(/\s*(₺|TL)$/i, "").replace(/\s+/g, "");
  if (!s) return "";
  if (s.startsWith("-")) return s;
  return `+${s.replace(/^\+/, "")}`;
}

type DbGroup = {
  id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  translations?: unknown;
  min_select: number;
  max_select: number | null;
  sort_order: number;
};

type DbOption = {
  id: string;
  group_id: string;
  name: string;
  name_en: string | null;
  name_ru: string | null;
  translations?: unknown;
  price_delta: string;
  calories: number | null;
  is_active: boolean;
  sort_order: number;
};

export async function listModifierGroups(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<{ ok: true; groups: AdminModifierGroup[] } | { ok: false; error: string }> {
  const [groups, options, links] = await Promise.all([
    supabase
      .from("modifier_groups")
      .select("id, name, name_en, name_ru, translations, min_select, max_select, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("modifier_options")
      .select("id, group_id, name, name_en, name_ru, translations, price_delta, calories, is_active, sort_order")
      .eq("restaurant_id", restaurantId)
      .order("sort_order", { ascending: true }),
    supabase.from("product_modifier_groups").select("group_id").eq("restaurant_id", restaurantId),
  ]);
  const err = groups.error || options.error || links.error;
  if (err) return { ok: false, error: err.message || "Seçenek grupları okunamadı." };

  const optionsByGroup = new Map<string, AdminModifierOption[]>();
  for (const o of (options.data ?? []) as DbOption[]) {
    const list = optionsByGroup.get(o.group_id) ?? [];
    list.push({
      id: o.id,
      name: o.name,
      translations: translationsFromRow(o, ["name"]),
      price_delta: o.price_delta ?? "",
      calories: o.calories != null ? String(o.calories) : "",
      is_active: o.is_active,
    });
    optionsByGroup.set(o.group_id, list);
  }
  const counts = new Map<string, number>();
  for (const l of (links.data ?? []) as { group_id: string }[]) {
    counts.set(l.group_id, (counts.get(l.group_id) ?? 0) + 1);
  }

  return {
    ok: true,
    groups: ((groups.data ?? []) as DbGroup[]).map((g) => ({
      id: g.id,
      name: g.name,
      translations: translationsFromRow(g, ["name"]),
      min_select: g.min_select > 0 ? String(g.min_select) : "",
      max_select: g.max_select != null ? String(g.max_select) : "",
      options: optionsByGroup.get(g.id) ?? [],
      product_count: counts.get(g.id) ?? 0,
    })),
  };
}

/** Grubu ve seçeneklerini kaydeder (yeni ya da mevcut). Kaldırılan seçenekler silinir. */
export async function saveModifierGroup(
  supabase: SupabaseClient,
  restaurantId: string,
  group: AdminModifierGroup,
  sortOrder: number
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const invalid = validateModifierGroup(group);
  if (invalid) return { ok: false, error: invalid };

  const min = parseIntField(group.min_select);
  const max = parseIntField(group.max_select);
  const row = {
    restaurant_id: restaurantId,
    name: group.name.trim(),
    translations: cleanTranslationsForSave(group.translations, NAME_LIMIT),
    min_select: typeof min === "number" ? min : 0,
    max_select: typeof max === "number" ? max : null,
  };

  let groupId = group.id;
  if (groupId) {
    const { error } = await supabase.from("modifier_groups").update(row).eq("id", groupId);
    if (error) return { ok: false, error: error.message || "Grup kaydedilemedi." };
  } else {
    const { data, error } = await supabase
      .from("modifier_groups")
      .insert({ ...row, sort_order: sortOrder })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message || "Grup kaydedilemedi." };
    groupId = (data as { id: string }).id;
  }

  const options = group.options.filter((o) => o.name.trim());
  const keepIds = options.map((o) => o.id).filter((id): id is string => Boolean(id));

  // Formdan kaldırılan seçenekleri sil.
  let del = supabase.from("modifier_options").delete().eq("group_id", groupId);
  if (keepIds.length > 0) del = del.not("id", "in", `(${keepIds.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: delErr.message || "Seçenekler güncellenemedi." };

  const toRow = (o: AdminModifierOption, index: number) => {
    const kcal = parseIntField(o.calories);
    return {
      group_id: groupId!,
      restaurant_id: restaurantId,
      name: o.name.trim(),
      translations: cleanTranslationsForSave(o.translations, NAME_LIMIT),
      price_delta: normalizePriceDelta(o.price_delta),
      calories: typeof kcal === "number" ? kcal : null,
      is_active: o.is_active,
      sort_order: index,
    };
  };

  const existing = options.map((o, i) => ({ o, i })).filter(({ o }) => o.id);
  const fresh = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.id);
  if (existing.length > 0) {
    const { error } = await supabase
      .from("modifier_options")
      .upsert(existing.map(({ o, i }) => ({ id: o.id, ...toRow(o, i) })), { onConflict: "id" });
    if (error) return { ok: false, error: error.message || "Seçenekler kaydedilemedi." };
  }
  if (fresh.length > 0) {
    const { error } = await supabase.from("modifier_options").insert(fresh.map(({ o, i }) => toRow(o, i)));
    if (error) return { ok: false, error: error.message || "Seçenekler kaydedilemedi." };
  }
  return { ok: true, id: groupId };
}

export async function deleteModifierGroup(
  supabase: SupabaseClient,
  groupId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("modifier_groups").delete().eq("id", groupId);
  return error ? { ok: false, error: error.message || "Grup silinemedi." } : { ok: true };
}

/** Grupların sırasını kaydeder (listedeki sıra). */
export async function saveModifierGroupOrder(
  supabase: SupabaseClient,
  groupIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const results = await Promise.all(
    groupIds.map((id, index) => supabase.from("modifier_groups").update({ sort_order: index }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  return failed?.error ? { ok: false, error: failed.error.message || "Sıra kaydedilemedi." } : { ok: true };
}

/** Ürün düzenlenirken bağlı grup ve önerilen ürün id'leri (sıralı). */
export async function loadProductLinks(
  supabase: SupabaseClient,
  productId: string
): Promise<{ ok: true; groupIds: string[]; pairingIds: string[] } | { ok: false; error: string }> {
  const [g, p] = await Promise.all([
    supabase
      .from("product_modifier_groups")
      .select("group_id, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_pairings")
      .select("paired_product_id, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true }),
  ]);
  const err = g.error || p.error;
  if (err) return { ok: false, error: err.message || "Ürün bağlantıları okunamadı." };
  return {
    ok: true,
    groupIds: ((g.data ?? []) as { group_id: string }[]).map((r) => r.group_id),
    pairingIds: ((p.data ?? []) as { paired_product_id: string }[]).map((r) => r.paired_product_id),
  };
}

/** Bağlantıları formdaki hale getirir: hepsini silip sırasıyla yeniden ekler. */
export async function saveProductLinks(
  supabase: SupabaseClient,
  args: { productId: string; restaurantId: string; groupIds: string[]; pairingIds: string[] }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const groupIds = [...new Set(args.groupIds)].slice(0, MAX_GROUPS_PER_PRODUCT);
  const pairingIds = [...new Set(args.pairingIds)].filter((id) => id !== args.productId).slice(0, MAX_PRODUCT_PAIRINGS);

  const [dg, dp] = await Promise.all([
    supabase.from("product_modifier_groups").delete().eq("product_id", args.productId),
    supabase.from("product_pairings").delete().eq("product_id", args.productId),
  ]);
  const delErr = dg.error || dp.error;
  if (delErr) return { ok: false, error: delErr.message || "Bağlantılar güncellenemedi." };

  if (groupIds.length > 0) {
    const { error } = await supabase.from("product_modifier_groups").insert(
      groupIds.map((group_id, sort_order) => ({
        product_id: args.productId,
        group_id,
        restaurant_id: args.restaurantId,
        sort_order,
      }))
    );
    if (error) return { ok: false, error: error.message || "Seçenek grupları bağlanamadı." };
  }
  if (pairingIds.length > 0) {
    const { error } = await supabase.from("product_pairings").insert(
      pairingIds.map((paired_product_id, sort_order) => ({
        product_id: args.productId,
        paired_product_id,
        restaurant_id: args.restaurantId,
        sort_order,
      }))
    );
    if (error) return { ok: false, error: error.message || "Önerilen ürünler kaydedilemedi." };
  }
  return { ok: true };
}

/**
 * Malzeme listesini kaydetmeye hazırlar: boşları atar, aynı adı bir kez tutar, üst sınır uygular.
 * Çeviriler `translations` içinde; eski name_en/name_ru da yazılır (bu jsonb'de tetikleyici yok,
 * geri dönülen eski sürüm de çevirileri görsün).
 */
export function sanitizeIngredientsForSave(list: RemovableIngredient[]): RemovableIngredient[] {
  const seen = new Set<string>();
  const out: RemovableIngredient[] = [];
  for (const item of list) {
    const name = (item.name ?? "").trim().slice(0, MODIFIER_NAME_MAX);
    if (!name) continue;
    const key = name.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    const translations = cleanTranslationsForSave(ingredientTranslations(item), NAME_LIMIT);
    const legacy = legacyColumnsFromTranslations(translations, ["name"]);
    out.push({
      name,
      ...(legacy.name_en ? { name_en: legacy.name_en } : {}),
      ...(legacy.name_ru ? { name_ru: legacy.name_ru } : {}),
      ...(Object.keys(translations).length > 0 ? { translations } : {}),
    });
    if (out.length >= MAX_REMOVABLE_INGREDIENTS) break;
  }
  return out;
}

/** Malzemenin tüm çevirileri (translations + eski name_en/name_ru; translations önceliklidir). */
export function ingredientTranslations(item: RemovableIngredient): TranslationMap {
  const map = translationsFromRow(
    { name_en: item.name_en ?? null, name_ru: item.name_ru ?? null, translations: item.translations ?? {} },
    ["name"]
  );
  return parseTranslations(map);
}
