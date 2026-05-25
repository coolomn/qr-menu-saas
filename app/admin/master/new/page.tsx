"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Shield } from "lucide-react";
import { masterLoginUrl } from "@/lib/master-admin/client-auth";
import type { PlanType } from "@/lib/master-admin/plans";
import { resolveSubscriptionDates } from "@/lib/master-admin/plans";
import { slugifyName } from "@/lib/master-admin/slug";
import { getBrowserSupabase, waitForBrowserSession } from "@/lib/supabase/browser";

type MasterMeResponse = {
  isMasterAdmin: true;
  userId: string;
  email: string | null;
};

type FormState = {
  name: string;
  slug: string;
  owner_email: string;
  plan_type: PlanType;
  starts_at: string;
  ends_at: string;
  max_products: string;
  max_categories: string;
  max_imports: string;
  import_period: "monthly" | "lifetime";
  admin_notes: string;
};

const initialForm: FormState = {
  name: "",
  slug: "",
  owner_email: "",
  plan_type: "6_months",
  starts_at: "",
  ends_at: "",
  max_products: "",
  max_categories: "",
  max_imports: "",
  import_period: "monthly",
  admin_notes: "",
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function MasterNewRestaurantPage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      const session = await waitForBrowserSession();
      if (!session) {
        if (!cancelled) router.replace(masterLoginUrl("/admin/master/new"));
        return;
      }

      const res = await fetch("/api/master/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        if (!cancelled) {
          if (res.status === 401) router.replace(masterLoginUrl("/admin/master/new"));
          else setError("Bu sayfaya erişim yetkiniz yok.");
        }
        return;
      }

      if (!cancelled) setAuthReady(true);
    };

    void guard();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const previewDates = useMemo(() => {
    try {
      const dates = resolveSubscriptionDates(form.plan_type, {
        startsAt: form.starts_at || null,
        endsAt: form.ends_at || null,
      });
      return { starts_at: dates.starts_at, ends_at: dates.ends_at, error: null as string | null };
    } catch (err) {
      return {
        starts_at: null,
        ends_at: null,
        error: err instanceof Error ? err.message : "Geçersiz tarih",
      };
    }
  }, [form.plan_type, form.starts_at, form.ends_at]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !slugTouched) {
        next.slug = slugifyName(String(value));
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const session = await waitForBrowserSession();
      if (!session) {
        router.replace(masterLoginUrl("/admin/master/new"));
        return;
      }

      const body = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        owner_email: form.owner_email.trim(),
        plan_type: form.plan_type,
        starts_at: form.starts_at || null,
        ends_at: form.plan_type === "custom" ? form.ends_at || null : null,
        max_products: form.max_products === "" ? null : Number(form.max_products),
        max_categories: form.max_categories === "" ? null : Number(form.max_categories),
        max_imports: form.max_imports === "" ? null : Number(form.max_imports),
        import_period: form.import_period,
        admin_notes: form.admin_notes.trim() || null,
      };

      const res = await fetch("/api/master/restaurants", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; owner_invited?: boolean };

      if (!res.ok) {
        setError(data.error || "Restoran oluşturulamadı.");
        return;
      }

      const invited = data.owner_invited ? "&invited=1" : "";
      router.push(`/admin/master?created=1${invited}`);
    } catch {
      setError("Beklenmeyen bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        {error ?? "Yükleniyor…"}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-wider">
              <Shield size={14} />
              TapMenu Master
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Yeni restoran</h1>
          </div>
          <Link
            href="/admin/master"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={16} />
            Listeye dön
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Restoran</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Restoran adı *</label>
              <input
                required
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Örnek Restoran"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Slug *</label>
              <input
                required
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  updateField("slug", e.target.value);
                }}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 font-mono text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ornek-restoran"
              />
              <p className="text-xs text-gray-500 mt-1">Public menü: /menu/{form.slug || "slug"}</p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Owner</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Owner e-posta *</label>
              <input
                required
                type="email"
                value={form.owner_email}
                onChange={(e) => updateField("owner_email", e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="sahip@ornek.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Kullanıcı yoksa davet e-postası gönderilir.
              </p>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Abonelik</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Plan *</label>
              <select
                value={form.plan_type}
                onChange={(e) => updateField("plan_type", e.target.value as PlanType)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="legacy">Legacy (süresiz)</option>
                <option value="6_months">6 Ay</option>
                <option value="12_months">12 Ay</option>
                <option value="custom">Özel</option>
              </select>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Başlangıç</label>
                <input
                  type="date"
                  value={form.starts_at}
                  onChange={(e) => updateField("starts_at", e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {form.plan_type === "custom" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Bitiş (özel)</label>
                  <input
                    type="date"
                    value={form.ends_at}
                    onChange={(e) => updateField("ends_at", e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">
              {previewDates.error ? (
                <span>{previewDates.error}</span>
              ) : (
                <>
                  <span className="font-semibold">Önizleme: </span>
                  Başlangıç {toDateInputValue(previewDates.starts_at) || "—"} — Bitiş{" "}
                  {previewDates.ends_at ? toDateInputValue(previewDates.ends_at) : "Sınırsız"}
                </>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Limitler</h2>
            <p className="text-xs text-gray-500">Boş bırakılırsa sınırsız (henüz zorlanmıyor).</p>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max ürün</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_products}
                  onChange={(e) => updateField("max_products", e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max kategori</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_categories}
                  onChange={(e) => updateField("max_categories", e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max import</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_imports}
                  onChange={(e) => updateField("max_imports", e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Import dönemi</label>
              <select
                value={form.import_period}
                onChange={(e) => updateField("import_period", e.target.value as "monthly" | "lifetime")}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="monthly">Aylık</option>
                <option value="lifetime">Ömür boyu</option>
              </select>
            </div>
          </section>

          <section>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Admin notu</label>
            <textarea
              rows={3}
              value={form.admin_notes}
              onChange={(e) => updateField("admin_notes", e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="İç notlar…"
            />
          </section>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || Boolean(previewDates.error)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300"
            >
              {submitting && <Loader2 size={18} className="animate-spin" />}
              {submitting ? "Oluşturuluyor…" : "Restoran oluştur"}
            </button>
            <Link
              href="/admin/master"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50"
            >
              İptal
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
