"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Check, Languages, Loader2, Search, Sparkles } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  LANGUAGE_INFO,
  TRANSLATION_LANGUAGES,
  type MenuLanguage,
  type TranslationLanguage,
} from "@/lib/i18n/languages";
import type { TranslationMap } from "@/lib/i18n/translations";
import { saveLimits } from "@/lib/i18n/translatable";
import {
  cleanTranslationsForSave,
  fillBlankTranslationFields,
  getTranslationField,
  missingTranslationFields,
  setTranslationField,
  translationTabsFor,
  translationsFromRow,
  withFieldFrom,
} from "@/lib/i18n/edit-translations";
import {
  CENTER_TYPE_LABELS,
  buildCenterEntries,
  ingredientKey,
  languageCoverage,
  type CenterEntry,
  type CenterEntryType,
} from "@/lib/admin-menu/translation-center";
import { listModifierGroups, sanitizeIngredientsForSave, type AdminModifierGroup } from "@/lib/admin-menu/modifiers";
import { parseRemovableIngredients } from "@/lib/public-menu/product-extras";
import { runAiTranslate } from "@/lib/admin-menu/ai-translate-client";
import type { AdminMenuCollectionListItem } from "@/lib/admin-menu/types";
import type { ProductVariant } from "@/lib/admin-menu/product-variants";

const supabase = getBrowserSupabase();

type Row = { id: string } & Record<string, unknown>;

type Props = {
  restaurantId: string;
  menuLanguages: MenuLanguage[];
  onMenuLanguagesSaved: (languages: MenuLanguage[]) => void;
  categories: Row[];
  products: Row[];
  productVariantsMap: Record<string, ProductVariant[]>;
  onCategoriesChanged: Dispatch<SetStateAction<Row[]>>;
  onProductsChanged: Dispatch<SetStateAction<Row[]>>;
  onVariantsChanged: Dispatch<SetStateAction<Record<string, ProductVariant[]>>>;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Ad",
  description: "Açıklama",
  note: "Not",
  main_group: "Ana grup",
  label: "Ad",
};

const MULTILINE_FIELDS = new Set(["description", "note"]);
const PAGE_SIZE = 60;
const SAVE_CONCURRENCY = 8;

type SaveState = "saving" | "saved" | "error";

/** Faz 2.5b: "Diller & Çeviri" sekmesi — menü dilleri + çeviri merkezi. */
export function LanguagesPanel(props: Props) {
  return (
    <div className="space-y-6">
      <MenuLanguagesCard
        restaurantId={props.restaurantId}
        menuLanguages={props.menuLanguages}
        onSaved={props.onMenuLanguagesSaved}
      />
      <TranslationCenter {...props} />
    </div>
  );
}

function MenuLanguagesCard({
  restaurantId,
  menuLanguages,
  onSaved,
}: {
  restaurantId: string;
  menuLanguages: MenuLanguage[];
  onSaved: (languages: MenuLanguage[]) => void;
}) {
  const [selected, setSelected] = useState<Set<MenuLanguage>>(() => new Set(menuLanguages));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const ordered: MenuLanguage[] = ["tr", ...TRANSLATION_LANGUAGES.filter((l) => selected.has(l))];
  const dirty = ordered.join(",") !== ["tr", ...translationTabsFor(menuLanguages)].join(",");

  const toggle = (lang: TranslationLanguage) => {
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lang)) next.delete(lang);
      else next.add(lang);
      next.add("tr");
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("restaurants").update({ menu_languages: ordered }).eq("id", restaurantId);
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: `Kaydedilemedi: ${error.message || "bilinmeyen hata"}` });
      return;
    }
    onSaved(ordered);
    setMessage({ ok: true, text: "Kaydedildi. Müşteri menüsündeki dil seçici güncellendi." });
  };

  return (
    <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Languages size={22} aria-hidden /> Menü dilleri
        </h2>
        <p className="mt-1 text-xs font-medium text-gray-500 leading-snug">
          Müşteri menüsünün dil seçicisinde görünecek diller. Menü, misafirin telefon diline göre açılır.
          Çevirisi olmayan metinler Türkçe gösterilir.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <label className="flex items-center gap-3 rounded-2xl border-2 border-blue-100 bg-blue-50/60 px-3 py-2.5 min-h-12">
          <input type="checkbox" checked disabled className="h-4 w-4" />
          <span className="text-sm font-black text-gray-900">Türkçe</span>
          <span className="ml-auto text-[10px] font-black uppercase text-blue-700">Ana dil</span>
        </label>
        {TRANSLATION_LANGUAGES.map((lang) => (
          <label
            key={lang}
            className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 min-h-12 cursor-pointer ${
              selected.has(lang) ? "border-blue-200 bg-white" : "border-gray-100 bg-gray-50/60"
            }`}
          >
            <input type="checkbox" checked={selected.has(lang)} onChange={() => toggle(lang)} className="h-4 w-4" />
            <span className="text-sm font-black text-gray-900">{LANGUAGE_INFO[lang].nativeName}</span>
            <span className="ml-auto text-[11px] font-bold text-gray-500">{LANGUAGE_INFO[lang].turkishName}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || busy}
          className="min-h-11 px-5 rounded-2xl bg-blue-600 text-white text-sm font-black hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Kaydediliyor…" : "Dilleri kaydet"}
        </button>
        {message && (
          <p className={`text-xs font-bold ${message.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

function TranslationCenter({
  restaurantId,
  menuLanguages,
  categories,
  products,
  productVariantsMap,
  onCategoriesChanged,
  onProductsChanged,
  onVariantsChanged,
}: Props) {
  const languages = useMemo(() => translationTabsFor(menuLanguages), [menuLanguages]);
  const [activeLang, setActiveLang] = useState<TranslationLanguage | null>(null);
  const lang = activeLang && languages.includes(activeLang) ? activeLang : languages[0] ?? null;

  const [menus, setMenus] = useState<AdminMenuCollectionListItem[]>([]);
  const [groups, setGroups] = useState<AdminModifierGroup[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Menüler ve seçenek grupları bu sekmede yüklenir (ürün/kategori zaten panelde var).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const [menuRes, groupRes] = await Promise.all([
          fetch(`/api/admin/menu-collections?restaurantId=${encodeURIComponent(restaurantId)}`, {
            headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
          }).then(async (res) => {
            const json = (await res.json()) as { items?: AdminMenuCollectionListItem[]; error?: string };
            if (!res.ok) throw new Error(json.error || "Menüler okunamadı.");
            return json.items ?? [];
          }),
          listModifierGroups(supabase, restaurantId),
        ]);
        if (cancelled) return;
        setMenus(menuRes);
        if (groupRes.ok) setGroups(groupRes.groups);
        else throw new Error(groupRes.error);
        setLoadState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Veriler okunamadı.");
        setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const entries = useMemo(
    () =>
      buildCenterEntries({
        products,
        variantsByProduct: productVariantsMap as unknown as Record<string, Row[]>,
        categories,
        menus: menus as unknown as Row[],
        modifierGroups: groups,
      }),
    [products, productVariantsMap, categories, menus, groups]
  );
  const entriesByKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries]);

  // Düzenlenen/AI ile doldurulan çeviriler. Ref = eşzamansız kayıt kodunun okuduğu güncel değer,
  // state = ekranda gösterilen kopyası (ikisi her zaman birlikte yazılır).
  const overridesRef = useRef<Record<string, TranslationMap>>({});
  const [overrides, setOverrides] = useState<Record<string, TranslationMap>>({});
  const setOverride = (key: string, map: TranslationMap) => {
    overridesRef.current = { ...overridesRef.current, [key]: map };
    setOverrides(overridesRef.current);
  };
  const dirtyRef = useRef<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  // Eşzamansız kayıt kodu en güncel ürün/kategori listesini görsün.
  const latest = useRef({ entriesByKey, products, categories });
  useEffect(() => {
    latest.current = { entriesByKey, products, categories };
  }, [entriesByKey, products, categories]);

  /** Ekranda gösterilen değer (render). */
  const shownTranslations = useCallback(
    (entry: CenterEntry): TranslationMap => overrides[entry.key] ?? entry.translations,
    [overrides]
  );
  /** Kayıt / AI için güncel değer (yalnız olay ve eşzamansız kodda). */
  const currentTranslations = (entry: CenterEntry): TranslationMap =>
    overridesRef.current[entry.key] ?? entry.translations;

  /**
   * Kategori çevirisini yazar: güncel satır DB'den okunur ve yalnız `fields` alanları değiştirilir
   * (kategori satırı → ad/not; ana grup satırı → yalnız main_group). Böylece kategorinin kendine
   * özgü ana grup çevirisi, ad kaydedilirken ortak değere eşitlenmez.
   */
  const saveCategoryFields = async (categoryId: string, source: TranslationMap, fields: readonly string[]) => {
    const { data: fresh, error: readErr } = await supabase
      .from("categories")
      .select("id, translations, name_en, name_ru, main_group_en, main_group_ru, note_en, note_ru")
      .eq("id", categoryId)
      .single();
    if (readErr || !fresh) throw new Error(readErr?.message || "Kategori okunamadı.");
    let next = translationsFromRow(fresh, ["name", "main_group", "note"]);
    for (const field of fields) next = withFieldFrom(next, source, field);
    const translations = cleanTranslationsForSave(next, saveLimits("category"));
    const { data, error } = await supabase.from("categories").update({ translations }).eq("id", categoryId).select("*").single();
    if (error) throw new Error(error.message);
    onCategoriesChanged((prev) => prev.map((c) => (c.id === categoryId ? { ...c, ...data } : c)));
  };

  /**
   * Bir malzemenin çevirisini ürüne yazar: malzeme listesi yazmadan hemen önce DB'den okunur
   * (panelde başka sekmede yapılan değişiklik ezilmez) ve yalnız bu malzemenin çevirisi değişir.
   */
  const saveIngredientOf = async (productId: string, key: string, map: TranslationMap) => {
    const { data: fresh, error: readErr } = await supabase
      .from("products")
      .select("id, removable_ingredients")
      .eq("id", productId)
      .single();
    if (readErr || !fresh) throw new Error(readErr?.message || "Ürün okunamadı.");
    const list = parseRemovableIngredients(fresh.removable_ingredients).map((item) =>
      ingredientKey(item.name) === key ? { name: item.name, translations: map } : item
    );
    const removable_ingredients = sanitizeIngredientsForSave(list);
    const { data, error } = await supabase
      .from("products")
      .update({ removable_ingredients })
      .eq("id", productId)
      .select("id, removable_ingredients")
      .single();
    if (error) throw new Error(error.message);
    onProductsChanged((prev) => prev.map((p) => (p.id === productId ? { ...p, ...data } : p)));
  };

  const persist = async (entry: CenterEntry) => {
    const map = currentTranslations(entry);
    switch (entry.type) {
      case "product": {
        const translations = cleanTranslationsForSave(map, saveLimits("product"));
        const { data, error } = await supabase
          .from("products")
          .update({ translations })
          .eq("id", entry.targetIds[0])
          .select("id, translations, name_en, name_ru, description_en, description_ru")
          .single();
        if (error) throw new Error(error.message);
        onProductsChanged((prev) => prev.map((p) => (p.id === entry.targetIds[0] ? { ...p, ...data } : p)));
        return;
      }
      case "variant": {
        const translations = cleanTranslationsForSave(map, saveLimits("variant"));
        const { data, error } = await supabase
          .from("product_variants")
          .update({ translations })
          .eq("id", entry.targetIds[0])
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        onVariantsChanged((prev) => {
          const next = { ...prev };
          const productId = (data as ProductVariant).product_id;
          next[productId] = (next[productId] ?? []).map((v) => (v.id === entry.targetIds[0] ? (data as ProductVariant) : v));
          return next;
        });
        return;
      }
      case "category":
        await saveCategoryFields(entry.targetIds[0], map, ["name", "note"]);
        return;
      case "main_group":
        for (const id of entry.targetIds) await saveCategoryFields(id, map, ["main_group"]);
        return;
      case "ingredient":
        for (const id of entry.targetIds) await saveIngredientOf(id, entry.key, map);
        return;
      case "menu": {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch(`/api/admin/menu-collections/${encodeURIComponent(entry.targetIds[0])}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
          body: JSON.stringify({ translations: cleanTranslationsForSave(map, saveLimits("menu")) }),
        });
        const json = (await res.json()) as { item?: AdminMenuCollectionListItem; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error || "Menü kaydedilemedi.");
        setMenus((prev) => prev.map((m) => (m.id === json.item!.id ? json.item! : m)));
        return;
      }
      case "modifier_group":
      case "modifier_option": {
        const table = entry.type === "modifier_group" ? "modifier_groups" : "modifier_options";
        const translations = cleanTranslationsForSave(map, saveLimits(entry.type));
        const { error } = await supabase.from(table).update({ translations }).eq("id", entry.targetIds[0]);
        if (error) throw new Error(error.message);
        setGroups((prev) =>
          prev.map((g) =>
            entry.type === "modifier_group"
              ? g.id === entry.targetIds[0]
                ? { ...g, translations }
                : g
              : { ...g, options: g.options.map((o) => (o.id === entry.targetIds[0] ? { ...o, translations } : o)) }
          )
        );
        return;
      }
    }
  };

  // Aynı satırın kayıtları sırayla yapılır (eski istek yenisinin üzerine yazmasın).
  const saveQueueRef = useRef(new Map<string, Promise<boolean>>());
  const unmountedRef = useRef(false);

  /** Kirli (kaydedilmemiş) satırı kaydeder; sonuç: kayıt başarılı mı. */
  const save = (key: string): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      if (unmountedRef.current) return false;
      if (!dirtyRef.current.has(key)) return true; // daha önceki sıradaki kayıt zaten yazdı
      const entry = latest.current.entriesByKey.get(key);
      if (!entry) return false;
      dirtyRef.current.delete(key);
      setSaveState((s) => ({ ...s, [key]: "saving" }));
      try {
        await persist(entry);
        // Kayıt sürerken yeniden yazıldıysa "Kaydedildi" deme; sıradaki kayıt (blur) yazacak.
        setSaveState((s) => {
          const next = { ...s };
          if (dirtyRef.current.has(key)) delete next[key];
          else next[key] = "saved";
          return next;
        });
        return true;
      } catch (e) {
        dirtyRef.current.add(key);
        setSaveState((s) => ({ ...s, [key]: "error" }));
        setSaveError(e instanceof Error ? e.message : "Kaydedilemedi.");
        return false;
      }
    };
    const previous = saveQueueRef.current.get(key) ?? Promise.resolve(true);
    const next = previous.then(run, run);
    saveQueueRef.current.set(key, next);
    return next;
  };

  const editField = (entry: CenterEntry, field: string, value: string) => {
    if (!lang) return;
    setOverride(entry.key, setTranslationField(currentTranslations(entry), lang, field, value));
    dirtyRef.current.add(entry.key);
    setSaveState((s) => {
      if (!s[entry.key]) return s;
      const next = { ...s };
      delete next[entry.key];
      return next;
    });
  };

  // --- liste filtresi (yazarken satır kaybolmasın diye anlık değil, "anlık görüntü") ---
  const [typeFilter, setTypeFilter] = useState<"all" | CenterEntryType>("all");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState(0);
  // Filtre değişince sayfa sınırı başa döner (anahtar eşleşmezse varsayılan).
  const filterKey = `${lang}|${typeFilter}|${onlyMissing}|${query}`;
  const [limitState, setLimitState] = useState({ key: filterKey, n: PAGE_SIZE });
  const limit = limitState.key === filterKey ? limitState.n : PAGE_SIZE;

  // Liste bir "anlık görüntü"dür: yazarken veya kaydedince satır listeden kaybolmasın;
  // dil/filtre değişince ya da "Listeyi yenile" / AI sonrası yeniden hesaplanır.
  const visibleKeys = useMemo(() => {
    if (!lang) return [];
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return entries
      .filter((e) => typeFilter === "all" || e.type === typeFilter)
      .filter((e) => !onlyMissing || missingTranslationFields(e.source, shownTranslations(e), lang).length > 0)
      .filter(
        (e) =>
          !q ||
          Object.values(e.source).some((t) => t.toLocaleLowerCase("tr-TR").includes(q)) ||
          (e.context ?? "").toLocaleLowerCase("tr-TR").includes(q)
      )
      .map((e) => e.key);
    // entries/overrides bilerek bağımlılık değil (anlık görüntü); entries.length menüler yüklenince yeniler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, typeFilter, onlyMissing, query, snapshot, loadState, entries.length]);

  // --- AI ile toplu doldurma ---
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const cancelRef = useRef({ cancelled: false });

  // Sekmeden çıkılınca (bileşen kaldırılınca) süren AI işi ve kayıtlar durur: bayat listeyle yazılmasın.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      cancelRef.current.cancelled = true;
    };
  }, []);

  const runAi = async (targetLanguages: TranslationLanguage[]) => {
    if (aiRunning) return;
    const list = [...latest.current.entriesByKey.values()];
    // AI isteğinde kısa kimlik (uzun ana grup / malzeme adları kimlik sınırını aşmasın).
    const keyById = new Map(list.map((e, i) => [`e${i}`, e.key]));
    const jobs = targetLanguages
      .map((language) => ({
        language,
        items: list.flatMap((e, i) => {
          const missing = missingTranslationFields(e.source, currentTranslations(e), language);
          if (missing.length === 0) return [];
          return [{ id: `e${i}`, kind: e.kind, fields: Object.fromEntries(missing.map((f) => [f, e.source[f]])) }];
        }),
      }))
      .filter((j) => j.items.length > 0);
    if (jobs.length === 0) {
      setAiMessage("Bu dillerde çevrilecek boş alan yok.");
      return;
    }
    cancelRef.current = { cancelled: false };
    setAiRunning(true);
    setAiMessage(null);
    setSaveError(null);
    let saved = 0;
    let failed = 0;
    let chain: Promise<void> = Promise.resolve();
    const result = await runAiTranslate({
      restaurantId,
      jobs,
      signal: cancelRef.current,
      onProgress: (done, total) => setAiProgress({ done, total }),
      onChunk: (language, results) => {
        // Kayıtlar sırayla (parça parça) yapılır: ortak satırlar (malzeme, ana grup) birbirini ezmesin.
        chain = chain.then(async () => {
          if (cancelRef.current.cancelled || unmountedRef.current) return;
          const keys: string[] = [];
          for (const [id, fields] of Object.entries(results)) {
            const key = keyById.get(id);
            const entry = key ? latest.current.entriesByKey.get(key) : undefined;
            if (!key || !entry) continue;
            setOverride(key, fillBlankTranslationFields(currentTranslations(entry), language, fields));
            dirtyRef.current.add(key);
            keys.push(key);
          }
          const count = (ok: boolean) => (ok ? (saved += 1) : (failed += 1));
          // Tekil satırlar paralel; aynı kategori/ürün satırına yazan ortak satırlar (ana grup,
          // malzeme) en sonda tek tek — birbirlerinin okuduğu güncel değeri ezmesinler.
          const isShared = (key: string) => key.startsWith("main_group:") || key.startsWith("ingredient:");
          const single = keys.filter((k) => !isShared(k));
          for (let i = 0; i < single.length; i += SAVE_CONCURRENCY) {
            if (cancelRef.current.cancelled || unmountedRef.current) return;
            const results = await Promise.all(single.slice(i, i + SAVE_CONCURRENCY).map((key) => save(key)));
            results.forEach(count);
          }
          for (const key of keys.filter(isShared)) {
            if (cancelRef.current.cancelled || unmountedRef.current) return;
            count(await save(key));
          }
        });
        return chain;
      },
    });
    await chain;
    setAiRunning(false);
    setAiProgress(null);
    setSnapshot((n) => n + 1);
    const parts = [`${result.translatedFields} alan çevrildi, ${saved} öğe kaydedildi.`];
    if (failed > 0) parts.push(`${failed} öğe kaydedilemedi (kırmızı işaretli).`);
    if (cancelRef.current.cancelled) parts.push("Durduruldu.");
    if (result.error) parts.push(result.error);
    setAiMessage(parts.join(" "));
  };

  if (languages.length === 0 || !lang) {
    return (
      <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-6">
        <h2 className="text-xl font-black text-gray-900">Çeviri merkezi</h2>
        <p className="mt-2 text-sm font-medium text-gray-500">
          Menünüzde yalnız Türkçe açık. Yukarıdan en az bir dil seçip kaydedin; çeviriler burada listelenir.
        </p>
      </section>
    );
  }

  const coverageFor = (l: TranslationLanguage) => languageCoverage(entries, l, shownTranslations);
  const shown = visibleKeys.slice(0, limit);

  return (
    <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">Çeviri merkezi</h2>
        <p className="mt-1 text-xs font-medium text-gray-500 leading-snug">
          Menüdeki tüm metinler tek listede. Yazdığınız çeviri, kutudan çıkınca kaydedilir. AI yalnız boş alanları
          doldurur; sizin yazdıklarınız değişmez. Aynı malzeme ve ana grup tek satırdır, her yerde birlikte güncellenir.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {languages.map((l) => {
          const c = coverageFor(l);
          return (
            <button
              key={l}
              type="button"
              onClick={() => setActiveLang(l)}
              aria-pressed={l === lang}
              className={`min-h-11 rounded-2xl border-2 px-3 py-1.5 text-left ${
                l === lang ? "border-blue-600 bg-blue-50" : "border-gray-100 bg-white hover:border-blue-200"
              }`}
            >
              <span className="block text-xs font-black text-gray-900">{LANGUAGE_INFO[l].turkishName}</span>
              <span className="mt-1 flex items-center gap-1.5">
                <span className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                  <span
                    className={`block h-full ${c.percent === 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${c.percent}%` }}
                  />
                </span>
                <span className="text-[10px] font-black text-gray-500">%{c.percent}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-blue-50/70 border border-blue-100 p-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => void runAi([lang])}
            disabled={aiRunning || loadState === "loading"}
            className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Sparkles size={14} aria-hidden /> {LANGUAGE_INFO[lang].turkishName} eksiklerini AI ile doldur
          </button>
          {languages.length > 1 && (
            <button
              type="button"
              onClick={() => void runAi([...languages])}
              disabled={aiRunning || loadState === "loading"}
              className="min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-4 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              <Sparkles size={14} aria-hidden /> Tüm dillerde eksikleri doldur
            </button>
          )}
          {aiRunning && (
            <button
              type="button"
              onClick={() => {
                cancelRef.current.cancelled = true;
              }}
              className="min-h-11 rounded-xl border border-gray-200 bg-white px-4 text-xs font-black text-gray-700"
            >
              Durdur
            </button>
          )}
        </div>
        {aiProgress && (
          <div className="space-y-1" role="status">
            <div className="h-2 rounded-full bg-white overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${aiProgress.total ? Math.round((aiProgress.done / aiProgress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[11px] font-bold text-blue-800">
              Çevriliyor ve kaydediliyor… {aiProgress.done}/{aiProgress.total} parça
            </p>
          </div>
        )}
        {aiMessage && <p className="text-[11px] font-bold text-gray-700" role="status">{aiMessage}</p>}
      </div>

      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="search"
            placeholder="Ara (Türkçe metin)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-11 rounded-xl border-2 border-gray-100 pl-9 pr-3 text-sm font-bold outline-none focus:border-blue-400"
          />
        </div>
        <select
          aria-label="Tür"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="min-h-11 rounded-xl border-2 border-gray-100 bg-white px-3 text-sm font-bold"
        >
          <option value="all">Tümü</option>
          {(Object.keys(CENTER_TYPE_LABELS) as CenterEntryType[]).map((t) => (
            <option key={t} value={t}>
              {CENTER_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-gray-700">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4" />
          Yalnız eksikler
        </label>
        <button
          type="button"
          onClick={() => setSnapshot((n) => n + 1)}
          className="min-h-11 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-600 hover:bg-gray-50"
        >
          Listeyi yenile
        </button>
      </div>

      {loadState === "loading" && (
        <p className="text-xs font-bold text-gray-500 inline-flex items-center gap-1.5">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Menüler ve seçenek grupları yükleniyor…
        </p>
      )}
      {loadState === "error" && (
        <p className="text-xs font-bold text-red-600">Menüler/seçenek grupları okunamadı: {loadError}</p>
      )}
      {saveError && (
        <p className="text-xs font-bold text-red-600" role="alert">
          Son kayıt hatası: {saveError}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm font-bold text-gray-400">
          {onlyMissing ? "Bu dilde eksik çeviri yok." : "Gösterilecek metin yok."}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {shown.map((key) => {
            const entry = entriesByKey.get(key);
            if (!entry) return null;
            const map = shownTranslations(entry);
            const state = saveState[key];
            return (
              <li key={key} className="py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    {CENTER_TYPE_LABELS[entry.type]}
                    {entry.context ? ` · ${entry.context}` : ""}
                  </span>
                  <span className="ml-auto text-[10px] font-black" aria-live="polite">
                    {state === "saving" && <span className="text-gray-400">Kaydediliyor…</span>}
                    {state === "saved" && (
                      <span className="inline-flex items-center gap-0.5 text-emerald-600">
                        <Check size={12} aria-hidden /> Kaydedildi
                      </span>
                    )}
                    {state === "error" && (
                      <button type="button" onClick={() => void save(key)} className="text-red-600 underline">
                        Kaydedilemedi — tekrar dene
                      </button>
                    )}
                  </span>
                </div>
                {Object.entries(entry.source).map(([field, text]) => {
                  const value = getTranslationField(map, lang, field);
                  const common = {
                    value,
                    placeholder: `${FIELD_LABELS[field] ?? field} (${LANGUAGE_INFO[lang].short})`,
                    "aria-label": `${text.slice(0, 60)} — ${LANGUAGE_INFO[lang].turkishName}`,
                    maxLength: saveLimits(entry.kind)[field],
                    onChange: (e: { target: { value: string } }) => editField(entry, field, e.target.value),
                    onBlur: () => {
                      if (dirtyRef.current.has(key)) void save(key);
                    },
                    className: `w-full min-w-0 rounded-xl border-2 px-3 py-2 text-sm outline-none focus:border-blue-400 ${
                      value.trim() ? "border-gray-100 bg-white" : "border-amber-100 bg-amber-50/40"
                    } ${MULTILINE_FIELDS.has(field) ? "font-medium resize-y" : "font-bold"}`,
                  };
                  return (
                    <div key={field} className="grid grid-cols-1 md:grid-cols-2 gap-1.5 md:gap-3 md:items-start">
                      <p
                        className={`text-gray-800 ${MULTILINE_FIELDS.has(field) ? "text-xs font-medium line-clamp-3" : "text-sm font-black"}`}
                      >
                        {text}
                      </p>
                      {MULTILINE_FIELDS.has(field) ? <textarea rows={2} {...common} /> : <input {...common} />}
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}
      {visibleKeys.length > limit && (
        <button
          type="button"
          onClick={() => setLimitState({ key: filterKey, n: limit + PAGE_SIZE })}
          className="w-full min-h-11 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-600 hover:border-blue-300"
        >
          Daha fazla göster ({visibleKeys.length - limit} kaldı)
        </button>
      )}
    </section>
  );
}
