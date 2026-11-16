"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { ModifierGroupModal } from "@/app/admin/_components/modifiers/ModifierGroupModal";
import {
  emptyModifierGroup,
  ingredientTranslations,
  listModifierGroups,
  type AdminModifierGroup,
} from "@/lib/admin-menu/modifiers";
import type { TranslationLanguage } from "@/lib/i18n/languages";
import { getTranslationField, setTranslationField } from "@/lib/i18n/edit-translations";
import { applyAiResults, entitiesTranslationStatus, type TranslatableEntity } from "@/lib/admin-menu/form-ai-translate";
import { TranslationSection, translationInputClass } from "@/app/admin/_components/i18n/TranslationTabs";
import { useFormAiTranslate } from "@/app/admin/_components/i18n/useFormAiTranslate";
import {
  MAX_GROUPS_PER_PRODUCT,
  MAX_PRODUCT_PAIRINGS,
  MAX_REMOVABLE_INGREDIENTS,
  describeSelectionRule,
  type RemovableIngredient,
} from "@/lib/public-menu/product-extras";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

export type ProductExtrasValue = {
  ingredients: RemovableIngredient[];
  groupIds: string[];
  pairingIds: string[];
};

export const emptyProductExtras = (): ProductExtrasValue => ({ ingredients: [], groupIds: [], pairingIds: [] });

type ProductOption = { id: string; name?: string | null; category_id?: string | null };
type CategoryOption = { id: string; name?: string | null };

type Props = {
  restaurantId: string;
  editingProductId: string | null;
  value: ProductExtrasValue;
  /** React state setter'ı: arka planda biten çeviri en güncel değere uygulanır. */
  onChange: (next: ProductExtrasValue | ((prev: ProductExtrasValue) => ProductExtrasValue)) => void;
  products: ProductOption[];
  categories: CategoryOption[];
  /** Düzenlenen ürünün bağlantıları yüklenirken */
  loading?: boolean;
  /** Menüde açık çeviri dilleri (TR hariç). */
  translationLanguages: readonly TranslationLanguage[];
};

const label = "text-[10px] font-black uppercase tracking-widest";
const input =
  "w-full min-w-0 bg-white border-2 border-white focus:border-blue-500 rounded-xl px-3 py-2.5 text-sm font-bold outline-none shadow-sm";

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function ruleOf(g: AdminModifierGroup): string {
  const min = Number(g.min_select) || 0;
  const max = g.max_select.trim() ? Number(g.max_select) : null;
  return describeSelectionRule({ min_select: min, max_select: max }, "tr");
}

/** Faz 2.4: ürün formunda seçenek grupları, çıkarılabilir malzemeler, "yanında iyi gider". */
export function ProductExtrasFields({
  restaurantId,
  editingProductId,
  value,
  onChange,
  products,
  categories,
  loading = false,
  translationLanguages,
}: Props) {
  const [groups, setGroups] = useState<AdminModifierGroup[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [ingredientDraft, setIngredientDraft] = useState("");
  const [showIngredientTranslations, setShowIngredientTranslations] = useState(false);
  const [pairingQuery, setPairingQuery] = useState("");
  const ai = useFormAiTranslate(restaurantId);
  // Başka ürüne geçilince bekleyen malzeme çevirisi yeni ürüne uygulanmasın.
  const resetAi = ai.reset;
  useEffect(() => {
    resetAi();
  }, [editingProductId, resetAi]);

  // Malzeme adları formda benzersiz (aynı ad iki kez eklenemez) → AI anahtarı ad.
  const ingredientEntities = (): TranslatableEntity[] =>
    value.ingredients.map((item) => ({
      id: `ingredient:${item.name}`,
      kind: "ingredient" as const,
      source: { name: item.name },
      translations: ingredientTranslations(item),
    }));

  const fillIngredientsWithAi = () => {
    void ai.run(ingredientEntities(), translationLanguages, (results) => {
      onChange((prev) => ({
        ...prev,
        ingredients: prev.ingredients.map((item) => ({
          ...item,
          translations: applyAiResults(ingredientTranslations(item), results, `ingredient:${item.name}`),
        })),
      }));
    });
  };

  const applyGroups = useCallback((res: Awaited<ReturnType<typeof listModifierGroups>>) => {
    if (res.ok) {
      setGroups(res.groups);
      setGroupsError(null);
    } else {
      setGroupsError(res.error);
    }
  }, []);

  const reloadGroups = useCallback(async () => {
    applyGroups(await listModifierGroups(supabase, restaurantId));
  }, [restaurantId, applyGroups]);

  useEffect(() => {
    let cancelled = false;
    listModifierGroups(supabase, restaurantId).then((res) => {
      if (!cancelled) applyGroups(res);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, applyGroups]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id!, g])), [groups]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, (c.name || "").trim()])),
    [categories]
  );
  const unattachedGroups = groups.filter((g) => g.id && !value.groupIds.includes(g.id));

  const pairingCandidates = useMemo(() => {
    const q = pairingQuery.trim().toLocaleLowerCase("tr-TR");
    if (!q) return [];
    return products
      .filter((p) => p.id !== editingProductId && !value.pairingIds.includes(p.id))
      .filter((p) => (p.name || "").toLocaleLowerCase("tr-TR").includes(q))
      .slice(0, 8);
  }, [pairingQuery, products, editingProductId, value.pairingIds]);

  const addIngredient = () => {
    const name = ingredientDraft.trim();
    if (!name || value.ingredients.length >= MAX_REMOVABLE_INGREDIENTS) return;
    const exists = value.ingredients.some(
      (i) => i.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR")
    );
    if (!exists) {
      onChange({ ...value, ingredients: [...value.ingredients, { name }] });
    }
    setIngredientDraft("");
  };

  const patchIngredient = (index: number, patch: Partial<RemovableIngredient>) =>
    onChange({
      ...value,
      ingredients: value.ingredients.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });

  return (
    <div className="space-y-3">
      {/* Seçenek grupları */}
      <div className="p-4 md:p-5 bg-violet-50 rounded-2xl border border-violet-100 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`${label} text-violet-700`}>Seçenek grupları (isteğe bağlı)</span>
          <button type="button" onClick={() => setCreatingGroup(true)}
            className="text-[11px] font-bold text-violet-700 hover:underline inline-flex items-center gap-1">
            <Plus size={13} /> Yeni grup oluştur
          </button>
        </div>
        {groupsError && <p className="text-xs font-bold text-red-600">{groupsError}</p>}
        {loading ? (
          <p className="text-xs font-medium text-violet-800/70">Yükleniyor…</p>
        ) : value.groupIds.length === 0 ? (
          <p className="text-[11px] font-medium text-violet-800/80 leading-snug">
            Örn. “Sos seçimi (1 seçin)” ya da “Ekstralar (+15 ₺)”. Grupları “Seçenek grupları” sekmesinde de yönetebilirsiniz.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {value.groupIds.map((id, index) => {
              const g = groupsById.get(id);
              return (
                <li key={id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{g?.name ?? "Silinmiş grup"}</p>
                    {g && (
                      <p className="text-[10px] font-bold text-gray-500 truncate">
                        {ruleOf(g)} · {g.options.filter((o) => o.is_active).map((o) => o.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <button type="button" disabled={index === 0}
                    onClick={() => onChange({ ...value, groupIds: moveItem(value.groupIds, index, -1) })}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="Yukarı taşı">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" disabled={index === value.groupIds.length - 1}
                    onClick={() => onChange({ ...value, groupIds: moveItem(value.groupIds, index, 1) })}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="Aşağı taşı">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button"
                    onClick={() => onChange({ ...value, groupIds: value.groupIds.filter((x) => x !== id) })}
                    className="p-1.5 rounded-lg bg-red-50 text-red-500" aria-label={`${g?.name ?? "Grubu"} üründen kaldır`}>
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {unattachedGroups.length > 0 && value.groupIds.length < MAX_GROUPS_PER_PRODUCT && (
          <select
            aria-label="Ürüne seçenek grubu bağla"
            className={input}
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) onChange({ ...value, groupIds: [...value.groupIds, id] });
            }}
          >
            <option value="">+ Grup bağla…</option>
            {unattachedGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({ruleOf(g)})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Çıkarılabilir malzemeler */}
      <div className="p-4 md:p-5 bg-orange-50 rounded-2xl border border-orange-100 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="ingredient-draft" className={`${label} text-orange-700`}>
            Çıkarılabilir malzemeler (isteğe bağlı)
          </label>
          {value.ingredients.length > 0 && (
            <button type="button" onClick={() => setShowIngredientTranslations((v) => !v)}
              className="text-[11px] font-bold text-orange-700 hover:underline">
              {showIngredientTranslations ? "Çevirileri gizle" : "Çeviriler"}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input
            id="ingredient-draft"
            className={input}
            placeholder="Örn: Soğan"
            maxLength={80}
            value={ingredientDraft}
            onChange={(e) => setIngredientDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter ürün formunu göndermesin; malzemeyi eklesin.
              if (e.key === "Enter") {
                e.preventDefault();
                addIngredient();
              }
            }}
          />
          <button type="button" onClick={addIngredient}
            disabled={!ingredientDraft.trim() || value.ingredients.length >= MAX_REMOVABLE_INGREDIENTS}
            className="shrink-0 min-h-11 px-4 rounded-xl bg-orange-600 text-white text-sm font-black disabled:opacity-40">
            Ekle
          </button>
        </div>
        {value.ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {value.ingredients.map((item, index) => (
              <span key={`${item.name}-${index}`}
                className="inline-flex items-center gap-1 rounded-full bg-white border border-orange-200 pl-3 pr-1 py-1 text-xs font-bold text-gray-800">
                {item.name}
                <button type="button" className="p-0.5 rounded-full hover:bg-orange-100" aria-label={`${item.name} kaldır`}
                  onClick={() => onChange({ ...value, ingredients: value.ingredients.filter((_, i) => i !== index) })}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        {value.ingredients.length > 0 && showIngredientTranslations && (
          <TranslationSection
            languages={translationLanguages}
            statusFor={(lang) => entitiesTranslationStatus(ingredientEntities(), lang)}
            onAiFill={fillIngredientsWithAi}
            aiBusy={ai.busy}
            aiMessage={ai.message}
          >
            {(lang) =>
              value.ingredients.map((item, index) => (
                <input
                  key={`${item.name}-${index}`}
                  className={translationInputClass}
                  placeholder={item.name}
                  aria-label={`${item.name} çevirisi`}
                  maxLength={80}
                  value={getTranslationField(ingredientTranslations(item), lang, "name")}
                  onChange={(e) =>
                    patchIngredient(index, {
                      translations: setTranslationField(ingredientTranslations(item), lang, "name", e.target.value),
                      // Eski kolonlar kayıtta translations'tan yeniden yazılır.
                      name_en: null,
                      name_ru: null,
                    })
                  }
                />
              ))
            }
          </TranslationSection>
        )}
      </div>

      {/* Yanında iyi gider */}
      <div className="p-4 md:p-5 bg-sky-50 rounded-2xl border border-sky-100 space-y-2.5">
        <label htmlFor="pairing-search" className={`${label} text-sky-700`}>
          Yanında iyi gider (en fazla {MAX_PRODUCT_PAIRINGS} ürün)
        </label>
        {value.pairingIds.length > 0 && (
          <ul className="space-y-1.5">
            {value.pairingIds.map((id, index) => {
              const p = productsById.get(id);
              return (
                <li key={id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{p?.name ?? "Silinmiş ürün"}</p>
                    {p?.category_id && (
                      <p className="text-[10px] font-bold text-gray-500 truncate">{categoryName.get(p.category_id)}</p>
                    )}
                  </div>
                  <button type="button" disabled={index === 0}
                    onClick={() => onChange({ ...value, pairingIds: moveItem(value.pairingIds, index, -1) })}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="Yukarı taşı">
                    <ChevronUp size={14} />
                  </button>
                  <button type="button" disabled={index === value.pairingIds.length - 1}
                    onClick={() => onChange({ ...value, pairingIds: moveItem(value.pairingIds, index, 1) })}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30" aria-label="Aşağı taşı">
                    <ChevronDown size={14} />
                  </button>
                  <button type="button"
                    onClick={() => onChange({ ...value, pairingIds: value.pairingIds.filter((x) => x !== id) })}
                    className="p-1.5 rounded-lg bg-red-50 text-red-500" aria-label={`${p?.name ?? "Ürünü"} kaldır`}>
                    <X size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {value.pairingIds.length < MAX_PRODUCT_PAIRINGS && (
          <div className="relative">
            <input
              id="pairing-search"
              className={input}
              placeholder="Ürün ara (örn: Ayran)"
              value={pairingQuery}
              onChange={(e) => setPairingQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              autoComplete="off"
            />
            {pairingCandidates.length > 0 && (
              <ul className="mt-1.5 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                {pairingCandidates.map((p) => (
                  <li key={p.id}>
                    <button type="button"
                      onClick={() => {
                        onChange({ ...value, pairingIds: [...value.pairingIds, p.id] });
                        setPairingQuery("");
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-sky-50 min-h-11">
                      <span className="text-sm font-bold text-gray-800">{p.name}</span>
                      {p.category_id && (
                        <span className="ml-2 text-[10px] font-bold text-gray-500">{categoryName.get(p.category_id)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pairingQuery.trim() && pairingCandidates.length === 0 && (
              <p className="mt-1.5 text-[11px] font-medium text-sky-800/80">Eşleşen ürün yok.</p>
            )}
          </div>
        )}
      </div>

      {creatingGroup && (
        <ModifierGroupModal
          restaurantId={restaurantId}
          initial={emptyModifierGroup()}
          sortOrder={groups.length}
          translationLanguages={translationLanguages}
          onClose={() => setCreatingGroup(false)}
          onSaved={(groupId) => {
            setCreatingGroup(false);
            void reloadGroups();
            if (!value.groupIds.includes(groupId)) onChange({ ...value, groupIds: [...value.groupIds, groupId] });
          }}
        />
      )}
    </div>
  );
}
