"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileUp,
  Loader2,
  Trash2,
  Check,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import type { ImportCategoryTarget, ImportMenuPayload } from "@/lib/menu-import/schema";
import { MENU_IMPORTS_BUCKET, buildImportStoragePath } from "@/lib/menu-import/paths";
import {
  buildSuggestedCategoryTargets,
  countCreateTargetsMergedInBatch,
  resolveMainGroupForImport,
} from "@/lib/menu-import/category-match";
import {
  ImportCategoryTargetCard,
  categoryTargetFromAi,
  type CategoryTargetUiState,
  type ExistingImportCategory,
} from "@/app/admin/import/_components/ImportCategoryTargetCard";

const supabase = getBrowserSupabase();

type ImportTargetMenu = {
  id: string;
  name: string;
  sort_order: number;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "menu";
}

const UNEXPECTED_SERVER_RESPONSE = "Sunucu beklenmeyen bir yanıt döndürdü.";
const ANALYZE_TIMEOUT_MESSAGE =
  "Görsel çok büyük veya analiz uzun sürdü. Lütfen daha küçük bir görsel yükleyin.";

async function readApiJsonResponse<T extends Record<string, unknown>>(
  res: Response
): Promise<{ data: T | null; parseError: string | null }> {
  const text = await res.text();
  if (!text.trim()) {
    if (res.status === 504) {
      return { data: null, parseError: ANALYZE_TIMEOUT_MESSAGE };
    }
    return {
      data: null,
      parseError: res.ok ? null : `${UNEXPECTED_SERVER_RESPONSE} (HTTP ${res.status})`,
    };
  }
  try {
    return { data: JSON.parse(text) as T, parseError: null };
  } catch {
    const trimmed = text.trim();
    if (
      res.status === 504 ||
      /timed out|task timed out|runtime timeout/i.test(trimmed)
    ) {
      return { data: null, parseError: ANALYZE_TIMEOUT_MESSAGE };
    }
    const looksLikeHtml = /<html/i.test(text);
    const looksLikePlatform =
      /^An error /i.test(trimmed) || /^Internal Server Error/i.test(trimmed);
    if (looksLikeHtml || looksLikePlatform) {
      return { data: null, parseError: UNEXPECTED_SERVER_RESPONSE };
    }
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      data: null,
      parseError: snippet || UNEXPECTED_SERVER_RESPONSE,
    };
  }
}

function mapAnalyzeErrorMessage(message: string): string {
  const m = message.trim().toLowerCase();
  if (
    m.includes("504") ||
    m.includes("timed out") ||
    m.includes("task timed out") ||
    m.includes("runtime timeout") ||
    m.includes("gateway timeout")
  ) {
    return ANALYZE_TIMEOUT_MESSAGE;
  }
  return message;
}

export default function AdminMenuImportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportMenuPayload | null>(null);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [envCheckDone, setEnvCheckDone] = useState(false);
  const [activeMenus, setActiveMenus] = useState<ImportTargetMenu[]>([]);
  const [targetMenuCollectionId, setTargetMenuCollectionId] = useState<string | null>(null);
  const [existingCategories, setExistingCategories] = useState<ExistingImportCategory[]>([]);
  const [categoryTargets, setCategoryTargets] = useState<CategoryTargetUiState[]>([]);

  const showTargetMenuPicker = activeMenus.length >= 2;
  const targetMenuName =
    activeMenus.find((m) => m.id === targetMenuCollectionId)?.name ?? null;

  const requireTargetMenuSelection = (): boolean => {
    if (!showTargetMenuPicker) return true;
    if (targetMenuCollectionId) return true;
    setError("Bu import hangi menüye aktarılacak? Lütfen bir menü seçin.");
    return false;
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/admin/login");
        return;
      }
      const { data: res } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", session.user.id)
        .single();
      if (!res?.id) {
        router.replace("/admin");
        return;
      }
      setRestaurantId(res.id);

      const { data: menuRows } = await supabase
        .from("menu_collections")
        .select("id, name, is_active, sort_order")
        .eq("restaurant_id", res.id)
        .order("sort_order");
      const active = (menuRows || [])
        .filter((m) => m.is_active)
        .map((m) => ({
          id: m.id as string,
          name: m.name as string,
          sort_order: typeof m.sort_order === "number" ? m.sort_order : 0,
        }));
      setActiveMenus(active);
      if (active.length === 1) {
        setTargetMenuCollectionId(active[0].id);
      } else {
        setTargetMenuCollectionId(null);
      }

      const { data: catRows } = await supabase
        .from("categories")
        .select("id, name, main_group")
        .eq("restaurant_id", res.id)
        .order("sort_order");

      const { data: productRows } = await supabase
        .from("products")
        .select("category_id")
        .eq("restaurant_id", res.id);

      const productCountByCategory = new Map<string, number>();
      for (const row of productRows || []) {
        const cid = row.category_id as string;
        productCountByCategory.set(cid, (productCountByCategory.get(cid) ?? 0) + 1);
      }

      setExistingCategories(
        (catRows || []).map((c) => ({
          id: c.id as string,
          name: c.name as string,
          main_group: c.main_group != null ? String(c.main_group) : null,
          product_count: productCountByCategory.get(c.id as string) ?? 0,
        }))
      );

      let missing: string[] = [];
      try {
        const r = await fetch("/api/menu-import/ready");
        const j = (await r.json()) as { missing?: string[] };
        missing = Array.isArray(j.missing) ? j.missing : [];
      } catch {
        missing = [];
      }
      setMissingEnv(missing);
      setEnvCheckDone(true);
      setLoading(false);
    })();
  }, [router]);

  const updateCategoryTarget = useCallback((ci: number, next: CategoryTargetUiState) => {
    setCategoryTargets((prev) => prev.map((t) => (t.import_index === ci ? next : t)));
  }, []);

  const updateProduct = useCallback(
    (ci: number, pi: number, field: "name" | "description" | "price", value: string) => {
      setPreview((prev) => {
        if (!prev) return prev;
        const next = { ...prev, categories: [...prev.categories] };
        const prods = [...next.categories[ci].products];
        prods[pi] = { ...prods[pi], [field]: value };
        next.categories[ci] = { ...next.categories[ci], products: prods };
        return next;
      });
    },
    []
  );

  const removeProduct = useCallback((ci: number, pi: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      next.categories[ci] = {
        ...next.categories[ci],
        products: next.categories[ci].products.filter((_, i) => i !== pi),
      };
      return next;
    });
  }, []);

  const removeCategory = useCallback((ci: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        categories: prev.categories.filter((_, i) => i !== ci),
      };
    });
    setCategoryTargets((prev) =>
      prev
        .filter((t) => t.import_index !== ci)
        .map((t) =>
          t.import_index > ci ? { ...t, import_index: t.import_index - 1 } : t
        )
    );
  }, []);

  const validateCategoryTargetsForCommit = (): string | null => {
    if (!preview) return "Önizleme verisi yok.";
    if (categoryTargets.length !== preview.categories.length) {
      return "Kategori hedefleri eksik. Sayfayı yenileyip analizi tekrarlayın.";
    }
    for (const t of categoryTargets) {
      if (t.mode === "existing") {
        if (!t.existing_category_id) {
          return `«${preview.categories[t.import_index]?.name || "Kategori"}»: mevcut kategori seçin.`;
        }
      } else {
        if (!t.name.trim()) {
          return `«${preview.categories[t.import_index]?.name || "Kategori"}»: kategori adı zorunlu.`;
        }
        const mg =
          t.main_group_preset === "custom"
            ? t.main_group_custom.trim()
            : t.main_group.trim();
        if (!mg) {
          return `«${t.name}»: ana grup zorunlu.`;
        }
      }
    }
    return null;
  };

  const buildCategoryTargetsPayload = (): ImportCategoryTarget[] => {
    return categoryTargets.map((t) => {
      const main_group =
        t.mode === "create"
          ? resolveMainGroupForImport(
              t.main_group_preset === "custom" ? t.main_group_custom : t.main_group
            )
          : undefined;
      return {
        import_index: t.import_index,
        mode: t.mode,
        existing_category_id: t.mode === "existing" ? t.existing_category_id : null,
        name: t.mode === "create" ? t.name.trim() : undefined,
        main_group,
      };
    });
  };

  const createTargetsMergedInBatch = useMemo(() => {
    return countCreateTargetsMergedInBatch(
      categoryTargets.map((t) => ({
        mode: t.mode,
        name: t.name,
        main_group:
          t.main_group_preset === "custom" ? t.main_group_custom : t.main_group,
      }))
    );
  }, [categoryTargets]);

  const runAnalyze = async () => {
    if (!file || !restaurantId) return;
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError(
        "PDF metin çıkarımı şu anda desteklenmiyor. Lütfen menüyü görsel olarak yükleyin."
      );
      return;
    }
    if (!requireTargetMenuSelection()) return;
    setError(null);
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Oturum bulunamadı.");
      const path = buildImportStoragePath(restaurantId, session.user.id, safeFileName(file.name));
      const { error: upErr } = await supabase.storage.from(MENU_IMPORTS_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) throw new Error(upErr.message || "Yükleme başarısız.");

      const res = await fetch("/api/menu-import/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          restaurantId,
          storagePath: path,
          mimeType: file.type || "image/jpeg",
        }),
      });
      const { data: json, parseError } = await readApiJsonResponse<{
        ok?: boolean;
        payload?: ImportMenuPayload;
        error?: string;
      }>(res);
      if (parseError) {
        throw new Error(parseError);
      }
      if (!res.ok) {
        throw new Error(json?.error || `Analiz başarısız (HTTP ${res.status}).`);
      }
      if (!json?.payload) {
        throw new Error(json?.error || "Analiz sonucu alınamadı.");
      }
      const suggested = buildSuggestedCategoryTargets(json.payload.categories, existingCategories);
      setCategoryTargets(
        suggested.map((s) =>
          categoryTargetFromAi(
            s.import_index,
            json.payload!.categories[s.import_index].name,
            json.payload!.categories[s.import_index].main_group,
            s.suggested_match_name,
            s.existing_category_id ?? null,
            s.mode
          )
        )
      );
      setPreview(json.payload);
      setStep("preview");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Hata";
      setError(mapAnalyzeErrorMessage(message));
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!preview || !restaurantId) return;
    if (!requireTargetMenuSelection()) return;
    if (preview.categories.length === 0) {
      setError("En az bir kategori gerekli.");
      return;
    }
    const totalProducts = preview.categories.reduce((n, c) => n + c.products.length, 0);
    if (totalProducts === 0) {
      setError("En az bir ürün gerekli.");
      return;
    }
    for (const c of preview.categories) {
      for (const p of c.products) {
        if (!p.name.trim()) {
          setError("Tüm ürünlerin adı dolu olmalı.");
          return;
        }
      }
    }
    const targetValidationError = validateCategoryTargetsForCommit();
    if (targetValidationError) {
      setError(targetValidationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Oturum bulunamadı.");
      const res = await fetch("/api/menu-import/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          restaurantId,
          payload: preview,
          target_menu_collection_id: targetMenuCollectionId ?? undefined,
          category_targets: buildCategoryTargetsPayload(),
        }),
      });
      const { data: json, parseError } = await readApiJsonResponse<{
        ok?: boolean;
        error?: string;
        categoriesCreated?: number;
        categoriesReused?: number;
        categoriesMergedInBatch?: number;
        productsCreated?: number;
        target_menu_name?: string;
        product_menu_links_skipped?: boolean;
      }>(res);
      if (parseError) {
        throw new Error(parseError);
      }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Kayıt başarısız (HTTP ${res.status}).`);
      }
      const menuLabel = json.target_menu_name || targetMenuName || "menü";
      let successMessage = `Menü «${menuLabel}» içine aktarıldı.`;
      if (typeof json.categoriesReused === "number" && json.categoriesReused > 0) {
        successMessage += `\n${json.categoriesReused} mevcut kategoriye eklendi.`;
      }
      if (typeof json.categoriesCreated === "number" && json.categoriesCreated > 0) {
        successMessage += `\n${json.categoriesCreated} yeni kategori oluşturuldu.`;
      }
      if (typeof json.categoriesMergedInBatch === "number" && json.categoriesMergedInBatch > 0) {
        successMessage += `\n${json.categoriesMergedInBatch} aynı isimli kategori birleştirildi.`;
      }
      if (json.product_menu_links_skipped) {
        successMessage +=
          "\n\nUyarı: Ürün–menü bağlantı tablosu kullanılamadı; ürünler menüde görünmeyebilir. Veritabanı migration’ını kontrol edin.";
      }
      alert(successMessage);
      router.push("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-400 font-bold">
        Yükleniyor…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-100 px-4 py-4 md:px-8 flex items-center gap-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-gray-500 hover:text-blue-600 font-bold text-sm"
        >
          <ArrowLeft size={20} />
          Panele dön
        </Link>
        <h1 className="text-lg md:text-xl font-black tracking-tight">Menü içe aktar (V1)</h1>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {envCheckDone && missingEnv.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 text-sm space-y-3">
            <div className="flex items-start gap-2 font-bold">
              <AlertTriangle className="shrink-0 mt-0.5 text-amber-600" size={20} />
              <span>Sunucu ayarları eksik — analiz çalışmaz</span>
            </div>
            <p className="text-amber-900/95 leading-relaxed">
              Menü içe aktarma dosyayı sunucuda okur ve yapay zekâya gönderir. Bunun için aşağıdaki değişkenler{" "}
              <strong>yalnızca sunucu ortamında</strong> tanımlı olmalı (tarayıcıya / istemciye koymayın).
            </p>
            <ul className="list-disc pl-5 font-mono text-xs space-y-0.5 bg-amber-100/60 rounded-xl px-4 py-3 border border-amber-200/80">
              {missingEnv.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <div className="text-xs text-amber-900/90 space-y-2 leading-relaxed">
              <p>
                <strong>Yerel:</strong> Proje kökünde{" "}
                <code className="bg-white/80 px-1.5 py-0.5 rounded border border-amber-200">.env.local</code> dosyasına ekleyin, kaydedip geliştirme sunucusunu durdurup tekrar{" "}
                <code className="bg-white/80 px-1 rounded">npm run dev</code> çalıştırın.
              </p>
              <p>
                <strong>Vercel / hosting:</strong> Proje → <strong>Settings → Environment Variables</strong> bölümüne ekleyin, ardından yeniden deploy edin.
              </p>
              <p>
                <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>: Supabase panelinde{" "}
                <strong>Project Settings → API</strong> sayfasındaki <strong>service_role</strong> gizli anahtarıdır.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-bold text-amber-800 underline hover:text-amber-950"
              onClick={async () => {
                setEnvCheckDone(false);
                try {
                  const r = await fetch("/api/menu-import/ready");
                  const d = (await r.json()) as { missing?: string[] };
                  setMissingEnv(Array.isArray(d.missing) ? d.missing : []);
                } catch {
                  setMissingEnv([]);
                } finally {
                  setEnvCheckDone(true);
                  setError(null);
                }
              }}
            >
              Yeniden kontrol et
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 p-4 text-red-800 text-sm font-medium">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <span>{error}</span>
          </div>
        )}

        {step === "upload" && (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 md:p-8 space-y-4">
            <p className="text-sm text-gray-500 leading-relaxed">
              Menü fotoğrafı (JPEG, PNG, WebP veya GIF) yükleyin. Sonuçlar canlı menüye yazılmaz;
              önce önizleyip onaylarsınız. PDF desteklenmiyor — sayfayı görüntü olarak kaydedip yükleyin.
            </p>
            {showTargetMenuPicker && (
              <div className="p-4 md:p-5 bg-violet-50 rounded-2xl border border-violet-100 space-y-3">
                <p className="text-sm font-bold text-violet-900">
                  Bu import hangi menüye aktarılacak?
                </p>
                <p className="text-xs text-violet-800/90 leading-relaxed">
                  Kategoriler yalnızca seçtiğiniz menüde görünür. Analiz etmeden önce hedef menüyü
                  seçin.
                </p>
                <div className="space-y-2">
                  {activeMenus.map((menu) => (
                    <label
                      key={menu.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        targetMenuCollectionId === menu.id
                          ? "bg-white border-violet-300 shadow-sm"
                          : "bg-violet-50/50 border-violet-100 hover:bg-white"
                      }`}
                    >
                      <input
                        type="radio"
                        name="import-target-menu"
                        checked={targetMenuCollectionId === menu.id}
                        onChange={() => {
                          setTargetMenuCollectionId(menu.id);
                          setError(null);
                        }}
                        className="h-4 w-4 border-violet-300 text-violet-600"
                      />
                      <span className="text-sm font-bold text-gray-800">{menu.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="block">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
                Dosya
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="w-full text-sm font-medium text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-50 file:text-blue-700"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  if (
                    picked &&
                    (picked.type === "application/pdf" ||
                      picked.name.toLowerCase().endsWith(".pdf"))
                  ) {
                    setError(
                      "PDF metin çıkarımı şu anda desteklenmiyor. Lütfen menüyü görsel olarak yükleyin."
                    );
                    setFile(null);
                    e.target.value = "";
                    return;
                  }
                  setError(null);
                  setFile(picked);
                }}
              />
            </label>
            <button
              type="button"
              disabled={
                !file ||
                busy ||
                missingEnv.length > 0 ||
                (showTargetMenuPicker && !targetMenuCollectionId)
              }
              onClick={runAnalyze}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {busy ? <Loader2 className="animate-spin" size={20} /> : <FileUp size={20} />}
              Analiz et
            </button>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-6">
            {targetMenuName && (
              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                <p className="text-sm font-black text-violet-900">
                  Hedef menü: <span className="font-black">{targetMenuName}</span>
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm font-bold text-gray-600">Önizleme — düzenleyin veya satırları silin.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("upload");
                  setPreview(null);
                  setCategoryTargets([]);
                  setFile(null);
                }}
                className="text-sm font-bold text-gray-500 hover:text-gray-800"
              >
                Yeni dosya
              </button>
            </div>

            {createTargetsMergedInBatch > 0 && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-amber-900 text-sm font-medium">
                <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                <span>
                  Aynı isimli kategoriler tek kategori altında birleştirilecek.
                </span>
              </div>
            )}

            {preview.categories.map((cat, ci) => {
              const target = categoryTargets.find((t) => t.import_index === ci);
              return (
              <div
                key={ci}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className="flex justify-end p-2 bg-gray-50/80 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => removeCategory(ci)}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-xl text-xs font-bold flex items-center gap-1"
                    title="Kategoriyi sil"
                  >
                    <Trash2 size={16} />
                    Kategoriyi kaldır
                  </button>
                </div>
                {target && (
                  <ImportCategoryTargetCard
                    aiName={cat.name}
                    aiMainGroup={cat.main_group}
                    productCount={cat.products.length}
                    target={target}
                    existingCategories={existingCategories}
                    onChange={(next) => updateCategoryTarget(ci, next)}
                  />
                )}
                <ul className="divide-y divide-gray-100">
                  {cat.products.map((p, pi) => (
                    <li key={pi} className="p-4 md:p-5 space-y-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeProduct(ci, pi)}
                          className="text-gray-400 hover:text-red-500 p-1 rounded-lg"
                          title="Ürünü sil"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <input
                        className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 font-bold text-sm outline-none focus:border-blue-500"
                        value={p.name}
                        onChange={(e) => updateProduct(ci, pi, "name", e.target.value)}
                        placeholder="Ürün adı"
                      />
                      <input
                        className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-500"
                        value={p.description ?? ""}
                        onChange={(e) => updateProduct(ci, pi, "description", e.target.value)}
                        placeholder="Açıklama (TR)"
                      />
                      {(p.name_en || p.name_ru || p.description_en || p.description_ru) && (
                        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-600 space-y-1">
                          {p.name_en && (
                            <p>
                              <span className="font-bold text-gray-500">EN:</span> {p.name_en}
                              {p.description_en ? ` — ${p.description_en}` : ""}
                            </p>
                          )}
                          {p.name_ru && (
                            <p>
                              <span className="font-bold text-gray-500">RU:</span> {p.name_ru}
                              {p.description_ru ? ` — ${p.description_ru}` : ""}
                            </p>
                          )}
                          {!p.name_en && p.description_en && (
                            <p>
                              <span className="font-bold text-gray-500">EN açıklama:</span>{" "}
                              {p.description_en}
                            </p>
                          )}
                          {!p.name_ru && p.description_ru && (
                            <p>
                              <span className="font-bold text-gray-500">RU açıklama:</span>{" "}
                              {p.description_ru}
                            </p>
                          )}
                        </div>
                      )}
                      <input
                        className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 text-sm font-black text-blue-600 outline-none focus:border-blue-500"
                        value={p.price ?? ""}
                        onChange={(e) => updateProduct(ci, pi, "price", e.target.value)}
                        placeholder="Fiyat"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
            })}

            <button
              type="button"
              disabled={
                busy ||
                preview.categories.length === 0 ||
                (showTargetMenuPicker && !targetMenuCollectionId)
              }
              onClick={runCommit}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-4 rounded-2xl font-black hover:bg-black disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 className="animate-spin" size={22} /> : <Check size={22} />}
              Onayla ve menüye ekle
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
