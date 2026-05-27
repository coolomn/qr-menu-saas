"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, Loader2, Mail, Shield } from "lucide-react";
import { OnboardingCard } from "@/app/admin/master/_components/onboarding-card";
import { OwnerTemporaryPasswordReveal } from "@/app/admin/master/_components/owner-temporary-password-reveal";
import { masterJsonFetch } from "@/lib/master-admin/client-api";
import { masterLoginUrl } from "@/lib/master-admin/client-auth";
import {
  effectiveDisplayStatus,
  isSubscriptionExpired,
  statusBadgeClass,
  statusLabel,
} from "@/lib/master-admin/display";
import type { PlanType } from "@/lib/master-admin/plans";
import { resolveSubscriptionDates } from "@/lib/master-admin/plans";
import type { MasterRestaurantListItem } from "@/lib/master-admin/types";
import { waitForBrowserSession } from "@/lib/supabase/browser";

type FormState = {
  name: string;
  slug: string;
  plan_type: PlanType;
  starts_at: string;
  ends_at: string;
  max_products: string;
  max_categories: string;
  max_imports: string;
  import_period: "monthly" | "lifetime";
  admin_notes: string;
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function itemToForm(item: MasterRestaurantListItem): FormState {
  return {
    name: item.name,
    slug: item.slug,
    plan_type: (item.plan_type as PlanType) || "legacy",
    starts_at: toDateInputValue(item.starts_at),
    ends_at: toDateInputValue(item.ends_at ?? item.subscription_ends_at),
    max_products: item.max_products != null ? String(item.max_products) : "",
    max_categories: item.max_categories != null ? String(item.max_categories) : "",
    max_imports: item.max_imports != null ? String(item.max_imports) : "",
    import_period:
      item.import_period === "lifetime" ? "lifetime" : "monthly",
    admin_notes: item.admin_notes ?? "",
  };
}

export default function MasterRestaurantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const restaurantId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [item, setItem] = useState<MasterRestaurantListItem | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [copied, setCopied] = useState(false);
  const [tempPasswordReveal, setTempPasswordReveal] = useState<{
    ownerEmail: string;
    temporaryPassword: string;
    loginUrl: string;
  } | null>(null);

  const loadRestaurant = useCallback(async () => {
    const session = await waitForBrowserSession();
    if (!session) {
      router.replace(masterLoginUrl(`/admin/master/${restaurantId}`));
      return null;
    }

    const result = await masterJsonFetch<{ restaurant: MasterRestaurantListItem }>(
      `/api/master/restaurants/${restaurantId}`,
      session.access_token
    );

    if (!result.ok) {
      if (result.status === 401) {
        router.replace(masterLoginUrl(`/admin/master/${restaurantId}`));
        return null;
      }
      if (result.status === 404) {
        setError("Restoran bulunamadı.");
        return null;
      }
      setError(result.error || "Restoran yüklenemedi.");
      return null;
    }

    setItem(result.data.restaurant);
    setForm(itemToForm(result.data.restaurant));
    return result.data.restaurant;
  }, [restaurantId, router]);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;

    const init = async () => {
      const session = await waitForBrowserSession();
      if (!session) {
        if (!cancelled) router.replace(masterLoginUrl(`/admin/master/${restaurantId}`));
        return;
      }

      const me = await masterJsonFetch<{ isMasterAdmin: boolean }>("/api/master/me", session.access_token);
      if (!me.ok) {
        if (!cancelled) {
          if (me.status === 401) router.replace(masterLoginUrl(`/admin/master/${restaurantId}`));
          else setError("Bu sayfaya erişim yetkiniz yok.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        await loadRestaurant();
        setLoading(false);
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, router, loadRestaurant]);

  const displayStatus = useMemo(() => {
    if (!item) return "active";
    return effectiveDisplayStatus(
      item.tenant_status,
      item.status,
      item.ends_at ?? item.subscription_ends_at
    );
  }, [item]);

  const previewDates = useMemo((): {
    error: string | null;
    ends_at: string | null;
  } => {
    if (!form) return { error: null, ends_at: null };
    try {
      const dates = resolveSubscriptionDates(form.plan_type, {
        startsAt: form.starts_at || null,
        endsAt: form.plan_type === "custom" ? form.ends_at || null : null,
      });
      return { error: null, ends_at: dates.ends_at };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Geçersiz tarih",
        ends_at: null,
      };
    }
  }, [form]);

  const withToken = async <T,>(fn: (token: string) => Promise<T>): Promise<T | null> => {
    const session = await waitForBrowserSession();
    if (!session) {
      router.replace(masterLoginUrl(`/admin/master/${restaurantId}`));
      return null;
    }
    return fn(session.access_token);
  };

  const ownerLoginUrl =
    typeof window !== "undefined" ? `${window.location.origin}/admin/login` : "/admin/login";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const result = await withToken((token) =>
      masterJsonFetch<{ restaurant: MasterRestaurantListItem }>(
        `/api/master/restaurants/${restaurantId}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            slug: form.slug.trim(),
            plan_type: form.plan_type,
            starts_at: form.starts_at || null,
            ends_at: form.plan_type === "custom" ? form.ends_at || null : null,
            max_products: form.max_products === "" ? null : Number(form.max_products),
            max_categories: form.max_categories === "" ? null : Number(form.max_categories),
            max_imports: form.max_imports === "" ? null : Number(form.max_imports),
            import_period: form.import_period,
            admin_notes: form.admin_notes.trim() || null,
          }),
        }
      )
    );

    setSaving(false);
    if (!result) return;
    if (!result.ok) {
      setError(result.error || "Kaydedilemedi.");
      return;
    }

    setItem(result.data.restaurant);
    setForm(itemToForm(result.data.restaurant));
    setSuccessMessage("Değişiklikler kaydedildi.");
  };

  const handleExtend = async (months: 6 | 12) => {
    setActionBusy(`extend-${months}`);
    setError(null);
    setSuccessMessage(null);

    const result = await withToken((token) =>
      masterJsonFetch<{ restaurant: MasterRestaurantListItem }>(
        `/api/master/restaurants/${restaurantId}/extend`,
        token,
        { method: "POST", body: JSON.stringify({ months }) }
      )
    );

    setActionBusy(null);
    if (!result) return;
    if (!result.ok) {
      setError(result.error || "Süre uzatılamadı.");
      return;
    }

    setItem(result.data.restaurant);
    setForm(itemToForm(result.data.restaurant));
    setSuccessMessage(`Süre ${months} ay uzatıldı.`);
  };

  const handleToggleStatus = async () => {
    setActionBusy("toggle");
    setError(null);
    setSuccessMessage(null);

    const result = await withToken((token) =>
      masterJsonFetch<{ restaurant: MasterRestaurantListItem; status: string }>(
        `/api/master/restaurants/${restaurantId}/toggle-status`,
        token,
        { method: "POST", body: "{}" }
      )
    );

    setActionBusy(null);
    if (!result) return;
    if (!result.ok) {
      setError(result.error || "Durum güncellenemedi.");
      return;
    }

    setItem(result.data.restaurant);
    setForm(itemToForm(result.data.restaurant));
    setSuccessMessage(
      result.data.status === "suspended" ? "Restoran pasifleştirildi." : "Restoran aktifleştirildi."
    );
  };

  const handleResetPassword = async (mode: "email" | "temporary_password") => {
    const busyKey = mode === "email" ? "reset-email" : "reset-temp";
    setActionBusy(busyKey);
    setError(null);
    setSuccessMessage(null);
    setTempPasswordReveal(null);

    const result = await withToken((token) =>
      masterJsonFetch<{
        ok: boolean;
        mode: string;
        owner_email: string;
        sent_at?: string;
        temporary_password?: string;
        login_url?: string;
      }>(`/api/master/restaurants/${restaurantId}/reset-password`, token, {
        method: "POST",
        body: JSON.stringify({ mode }),
      })
    );

    setActionBusy(null);
    if (!result) return;
    if (!result.ok) {
      setError(result.error || "Şifre işlemi başarısız.");
      return;
    }

    const data = result.data;
    if (data.mode === "temporary_password" && data.temporary_password) {
      setTempPasswordReveal({
        ownerEmail: data.owner_email,
        temporaryPassword: data.temporary_password,
        loginUrl: data.login_url ?? ownerLoginUrl,
      });
      setSuccessMessage("Yeni geçici şifre oluşturuldu. Aşağıdan kopyalayın.");
      return;
    }

    if (data.mode === "email" && data.sent_at) {
      const sent = new Date(data.sent_at).toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      setSuccessMessage(`Şifre sıfırlama e-postası gönderildi (${data.owner_email}, ${sent}).`);
    }
  };

  const copyMenuLink = async () => {
    if (!item) return;
    const url = `${window.location.origin}/menu/${item.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Menü linki:", url);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Yükleniyor…
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <p className="text-gray-700 mb-4">{error}</p>
          <Link href="/admin/master" className="text-blue-600 font-bold">
            Listeye dön
          </Link>
        </div>
      </div>
    );
  }

  if (!form || !item) return null;

  const isSuspended = displayStatus === "suspended";
  const expired = isSubscriptionExpired(
    item.ends_at ?? item.subscription_ends_at,
    item.tenant_status,
    item.status
  );

  const ownerCanResetPassword = Boolean(item.owner_id && item.owner_email);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-wider">
              <Shield size={14} />
              TapMenu Master
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">{item.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass(displayStatus)}`}
              >
                {statusLabel(displayStatus)}
              </span>
              {expired && (
                <span className="text-xs font-bold text-red-600">Bitiş tarihi geçmiş</span>
              )}
            </div>
          </div>
          <Link
            href="/admin/master"
            className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-900 shrink-0"
          >
            <ArrowLeft size={16} />
            Listeye dön
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {successMessage && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <OnboardingCard item={item} loginUrl={ownerLoginUrl} />

        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Owner şifre</h2>
          <p className="text-xs text-gray-500">
            Müşteri şifresini unuttuysa sıfırlama maili veya tek seferlik geçici şifre ile destek
            verin.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(actionBusy) || !ownerCanResetPassword}
              onClick={() => void handleResetPassword("email")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionBusy === "reset-email" && <Loader2 size={14} className="animate-spin" />}
              <Mail size={14} />
              Şifre sıfırlama maili gönder
            </button>
            <button
              type="button"
              disabled={Boolean(actionBusy) || !ownerCanResetPassword}
              onClick={() => void handleResetPassword("temporary_password")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionBusy === "reset-temp" && <Loader2 size={14} className="animate-spin" />}
              Yeni geçici şifre oluştur
            </button>
          </div>
          {!ownerCanResetPassword && (
            <p className="text-xs text-amber-800">Owner e-postası veya hesap bağlantısı eksik.</p>
          )}
        </section>

        {tempPasswordReveal && (
          <OwnerTemporaryPasswordReveal
            ownerEmail={tempPasswordReveal.ownerEmail}
            temporaryPassword={tempPasswordReveal.temporaryPassword}
            loginUrl={tempPasswordReveal.loginUrl}
            onDismiss={() => setTempPasswordReveal(null)}
          />
        )}

        <section className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Hızlı işlemler</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(actionBusy)}
              onClick={() => void handleToggleStatus()}
              className={`px-4 py-2 rounded-xl text-sm font-bold border ${
                isSuspended
                  ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
              }`}
            >
              {actionBusy === "toggle" && <Loader2 size={14} className="inline animate-spin mr-1" />}
              {isSuspended ? "Aktifleştir" : "Pasifleştir"}
            </button>
            <button
              type="button"
              disabled={Boolean(actionBusy)}
              onClick={() => void handleExtend(6)}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50"
            >
              {actionBusy === "extend-6" && <Loader2 size={14} className="inline animate-spin mr-1" />}
              +6 ay
            </button>
            <button
              type="button"
              disabled={Boolean(actionBusy)}
              onClick={() => void handleExtend(12)}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50"
            >
              {actionBusy === "extend-12" && <Loader2 size={14} className="inline animate-spin mr-1" />}
              +12 ay
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
            <a
              href={`/menu/${item.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 font-bold"
            >
              Public menüyü aç
              <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={() => void copyMenuLink()}
              className="inline-flex items-center gap-1 text-gray-600 font-bold"
            >
              <Copy size={14} />
              {copied ? "Kopyalandı" : "Link kopyala"}
            </button>
          </div>
        </section>

        <form
          onSubmit={(e) => void handleSave(e)}
          className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Restoran</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Ad *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Slug *</label>
              <input
                required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 font-mono text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Owner e-posta</label>
              <input
                readOnly
                value={item.owner_email ?? "—"}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-gray-500 bg-gray-50 cursor-not-allowed"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Abonelik</h2>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Plan</label>
              <select
                value={form.plan_type}
                onChange={(e) => setForm({ ...form, plan_type: e.target.value as PlanType })}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="legacy">Legacy</option>
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
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {form.plan_type === "custom" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Bitiş</label>
                  <input
                    type="date"
                    value={form.ends_at}
                    onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
            {!previewDates.error && (
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">
                Kayıt önizlemesi: Bitiş{" "}
                {previewDates.ends_at ? toDateInputValue(previewDates.ends_at) : "Sınırsız"}
              </div>
            )}
            {previewDates.error && (
              <p className="text-sm text-red-600">{previewDates.error}</p>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Limitler</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max ürün</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_products}
                  onChange={(e) => setForm({ ...form, max_products: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max kategori</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_categories}
                  onChange={(e) => setForm({ ...form, max_categories: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max import</label>
                <input
                  type="number"
                  min={0}
                  value={form.max_imports}
                  onChange={(e) => setForm({ ...form, max_imports: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Import dönemi</label>
              <select
                value={form.import_period}
                onChange={(e) =>
                  setForm({
                    ...form,
                    import_period: e.target.value as "monthly" | "lifetime",
                  })
                }
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
              rows={4}
              value={form.admin_notes}
              onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
          </section>

            <button
              type="submit"
              disabled={saving || Boolean(actionBusy) || Boolean(previewDates.error)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
            {saving && <Loader2 size={18} className="animate-spin" />}
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </form>
      </main>
    </div>
  );
}
