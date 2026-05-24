"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
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
import type { ImportMenuPayload } from "@/lib/menu-import/schema";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "menu";
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

  const updateCategoryName = useCallback((ci: number, name: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      next.categories[ci] = { ...next.categories[ci], name };
      return next;
    });
  }, []);

  const updateCategoryMain = useCallback((ci: number, main_group: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next = { ...prev, categories: [...prev.categories] };
      next.categories[ci] = { ...next.categories[ci], main_group };
      return next;
    });
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
  }, []);

  const runAnalyze = async () => {
    if (!file || !restaurantId) return;
    setError(null);
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Oturum bulunamadı.");
      const path = `imports/${session.user.id}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, file, {
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
          mimeType: file.type,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; payload?: ImportMenuPayload; error?: string };
      if (!res.ok || !json.payload) {
        throw new Error(json.error || "Analiz başarısız.");
      }
      setPreview(json.payload);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    if (!preview || !restaurantId) return;
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
        body: JSON.stringify({ restaurantId, payload: preview }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        categoriesCreated?: number;
        productsCreated?: number;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Kayıt başarısız.");
      }
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
              PDF veya menü fotoğrafı yükleyin. Sonuçlar canlı menüye yazılmaz; önce önizleyip onaylarsınız.
              Taranmış PDF’lerde metin çıkmayabilir — bu durumda sayfayı görüntü olarak kaydedip yükleyin.
            </p>
            <label className="block">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
                Dosya
              </span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf"
                className="w-full text-sm font-medium text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-50 file:text-blue-700"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              disabled={!file || busy || missingEnv.length > 0}
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm font-bold text-gray-600">Önizleme — düzenleyin veya satırları silin.</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep("upload");
                  setPreview(null);
                  setFile(null);
                }}
                className="text-sm font-bold text-gray-500 hover:text-gray-800"
              >
                Yeni dosya
              </button>
            </div>

            {preview.categories.map((cat, ci) => (
              <div
                key={ci}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <div className="p-4 md:p-5 border-b border-gray-50 bg-gray-50/80 flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      Kategori
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCategory(ci)}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-xl"
                      title="Kategoriyi sil"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <input
                    className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 font-black text-gray-900 outline-none focus:border-blue-500"
                    value={cat.name}
                    onChange={(e) => updateCategoryName(ci, e.target.value)}
                  />
                  <input
                    placeholder="Ana grup (ör. YİYECEKLER)"
                    className="w-full border-2 border-gray-100 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 outline-none focus:border-blue-500"
                    value={cat.main_group ?? ""}
                    onChange={(e) => updateCategoryMain(ci, e.target.value)}
                  />
                </div>
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
                        placeholder="Açıklama"
                      />
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
            ))}

            <button
              type="button"
              disabled={busy || preview.categories.length === 0}
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
