"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, LogOut, Plus, Shield } from "lucide-react";
import { masterJsonFetch } from "@/lib/master-admin/client-api";
import { masterLoginUrl } from "@/lib/master-admin/client-auth";
import {
  effectiveDisplayStatus,
  isSubscriptionExpired,
  statusBadgeClass,
  statusLabel,
} from "@/lib/master-admin/display";
import type { MasterRestaurantListItem } from "@/lib/master-admin/types";
import { getBrowserSupabase, waitForBrowserSession } from "@/lib/supabase/browser";

const supabase = getBrowserSupabase();

type MasterMeResponse = {
  isMasterAdmin: true;
  userId: string;
  email: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function planLabel(planType: string | null): string {
  switch (planType) {
    case "legacy":
      return "Legacy";
    case "6_months":
      return "6 Ay";
    case "12_months":
      return "12 Ay";
    case "custom":
      return "Özel";
    default:
      return "—";
  }
}

async function masterFetch<T>(
  path: string,
  token: string
): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

function RestaurantStatusBadge({ r }: { r: MasterRestaurantListItem }) {
  const display = effectiveDisplayStatus(r.tenant_status, r.status, r.ends_at ?? r.subscription_ends_at);
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass(display)}`}>
      {statusLabel(display)}
    </span>
  );
}

export default function MasterAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [masterEmail, setMasterEmail] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<MasterRestaurantListItem[]>([]);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [extendBusyId, setExtendBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("created") === "1") {
      const invited = params.get("invited") === "1";
      setSuccessMessage(
        invited
          ? "Restoran oluşturuldu. Owner’a davet e-postası gönderildi."
          : "Restoran başarıyla oluşturuldu."
      );
      window.history.replaceState({}, "", "/admin/master");
    }
  }, []);

  const reloadList = useCallback(async (token: string) => {
    const listResult = await masterFetch<{ restaurants: MasterRestaurantListItem[] }>(
      "/api/master/restaurants",
      token
    );
    if (listResult.ok) {
      setRestaurants(listResult.data.restaurants);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const session = await waitForBrowserSession();
      if (!session) {
        if (!cancelled) {
          router.replace(masterLoginUrl());
        }
        return;
      }

      const token = session.access_token;
      const meResult = await masterFetch<MasterMeResponse>("/api/master/me", token);

      if (!meResult.ok) {
        if (!cancelled) {
          if (meResult.status === 401) {
            router.replace(masterLoginUrl());
            return;
          }
          setError("Bu sayfaya erişim yetkiniz yok.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setMasterEmail(meResult.data.email);
      }

      if (!cancelled) {
        await reloadList(token);
        setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router, reloadList]);

  const copyMenuLink = async (slug: string) => {
    const url = `${window.location.origin}/menu/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      window.setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      window.prompt("Menü linki:", url);
    }
  };

  const handleQuickExtend = async (restaurantId: string) => {
    setExtendBusyId(restaurantId);
    setError(null);

    const session = await waitForBrowserSession();
    if (!session) {
      router.replace(masterLoginUrl());
      return;
    }

    const result = await masterJsonFetch<{ restaurant: MasterRestaurantListItem }>(
      `/api/master/restaurants/${restaurantId}/extend`,
      session.access_token,
      { method: "POST", body: JSON.stringify({ months: 6 }) }
    );

    setExtendBusyId(null);
    if (!result.ok) {
      setError(result.error || "Süre uzatılamadı.");
      return;
    }

    setSuccessMessage("Süre 6 ay uzatıldı.");
    await reloadList(session.access_token);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600">
        Yükleniyor…
      </div>
    );
  }

  if (error && restaurants.length === 0 && !successMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <Shield className="mx-auto text-red-500 mb-4" size={32} />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Erişim reddedildi</h1>
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <Link
            href="/admin"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
          >
            Restoran paneline dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 font-black text-xs uppercase tracking-wider">
              <Shield size={14} />
              TapMenu Master
            </div>
            <h1 className="text-2xl font-black text-gray-900 mt-1">Restoranlar</h1>
            {masterEmail && <p className="text-sm text-gray-500 mt-1">{masterEmail}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/master/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
            >
              <Plus size={16} />
              Yeni restoran
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50"
            >
              <LogOut size={16} />
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {successMessage && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
            {successMessage}
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}
        {restaurants.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
            Henüz restoran kaydı yok.
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Restoran</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Owner</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Plan</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Başlangıç</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Bitiş</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">Durum</th>
                    <th className="text-left px-4 py-3 font-bold text-gray-700">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((r) => {
                    const endsAt = r.ends_at ?? r.subscription_ends_at;
                    const expired = isSubscriptionExpired(endsAt, r.tenant_status, r.status);
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-gray-100 last:border-0 hover:bg-gray-50/80 ${expired ? "bg-red-50/40" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/master/${r.id}`}
                            className="font-bold text-blue-600 hover:text-blue-800"
                          >
                            {r.name}
                          </Link>
                          <div className="text-xs text-gray-500 font-mono">{r.slug}</div>
                          {expired && (
                            <div className="text-xs font-bold text-red-600 mt-0.5">Süre doldu</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.owner_email ?? (r.owner_id ? "—" : "Atanmamış")}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{planLabel(r.plan_type)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {formatDate(r.starts_at ?? r.created_at)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatDate(endsAt)}</td>
                        <td className="px-4 py-3">
                          <RestaurantStatusBadge r={r} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/master/${r.id}`}
                              className="text-xs font-bold text-gray-700 hover:text-gray-900"
                            >
                              Düzenle
                            </Link>
                            <button
                              type="button"
                              disabled={extendBusyId === r.id}
                              onClick={() => void handleQuickExtend(r.id)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                            >
                              {extendBusyId === r.id ? "…" : "+6 ay"}
                            </button>
                            <a
                              href={`/menu/${r.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold text-xs"
                            >
                              Menü
                              <ExternalLink size={10} />
                            </a>
                            <button
                              type="button"
                              onClick={() => void copyMenuLink(r.slug)}
                              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-800 text-xs font-semibold"
                            >
                              <Copy size={10} />
                              {copiedSlug === r.slug ? "OK" : "Kopyala"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-4">
              {restaurants.map((r) => {
                const endsAt = r.ends_at ?? r.subscription_ends_at;
                const expired = isSubscriptionExpired(endsAt, r.tenant_status, r.status);
                return (
                  <article
                    key={r.id}
                    className={`bg-white border rounded-2xl p-5 shadow-sm space-y-3 ${expired ? "border-red-200" : "border-gray-200"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/admin/master/${r.id}`}
                          className="font-black text-blue-600 hover:text-blue-800"
                        >
                          {r.name}
                        </Link>
                        <p className="text-xs text-gray-500 font-mono">{r.slug}</p>
                        {expired && (
                          <p className="text-xs font-bold text-red-600 mt-1">Süre doldu</p>
                        )}
                      </div>
                      <RestaurantStatusBadge r={r} />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-gray-500 text-xs">Owner</dt>
                        <dd className="text-gray-800 font-medium">{r.owner_email ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 text-xs">Plan</dt>
                        <dd className="text-gray-800 font-medium">{planLabel(r.plan_type)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500 text-xs">Bitiş</dt>
                        <dd className="text-gray-800">{formatDate(endsAt)}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Link href={`/admin/master/${r.id}`} className="text-sm font-bold text-gray-700">
                        Düzenle
                      </Link>
                      <button
                        type="button"
                        disabled={extendBusyId === r.id}
                        onClick={() => void handleQuickExtend(r.id)}
                        className="text-sm font-bold text-indigo-600 disabled:opacity-50"
                      >
                        +6 ay
                      </button>
                      <a
                        href={`/menu/${r.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 text-sm font-bold"
                      >
                        Menü
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
