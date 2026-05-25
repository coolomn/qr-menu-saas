"use client";

import { useMemo } from "react";
import { UserRound, LogIn, CalendarClock } from "lucide-react";
import {
  effectiveDisplayStatus,
  statusBadgeClass,
  statusLabel,
} from "@/lib/master-admin/display";
import type { MasterRestaurantListItem } from "@/lib/master-admin/types";
import { CopyButton } from "./copy-button";

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sınırsız";
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

type OnboardingCardProps = {
  item: MasterRestaurantListItem;
  loginUrl: string;
};

export function OnboardingCard({ item, loginUrl }: OnboardingCardProps) {
  const displayStatus = useMemo(
    () =>
      effectiveDisplayStatus(
        item.tenant_status,
        item.status,
        item.ends_at ?? item.subscription_ends_at
      ),
    [item]
  );

  const subscriptionEnds = item.ends_at ?? item.subscription_ends_at;

  return (
    <section className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">
            Müşteri onboarding
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Owner girişi ve abonelik özeti — müşteriye paylaşın.
          </p>
        </div>
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${statusBadgeClass(displayStatus)}`}
        >
          {statusLabel(displayStatus)}
        </span>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <UserRound size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <dt className="text-xs font-bold text-gray-500 uppercase">Owner e-posta</dt>
            <dd className="text-sm font-semibold text-gray-900 mt-0.5 break-all">
              {item.owner_email || "—"}
            </dd>
          </div>
        </div>

        <div className="flex gap-3">
          <LogIn size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <dt className="text-xs font-bold text-gray-500 uppercase">Panel giriş adresi</dt>
            <dd className="text-sm font-mono text-gray-900 mt-0.5 break-all">{loginUrl}</dd>
            <CopyButton text={loginUrl} label="Bağlantıyı kopyala" className="mt-2" />
          </div>
        </div>

        <div className="flex gap-3 sm:col-span-2">
          <CalendarClock size={18} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <dt className="text-xs font-bold text-gray-500 uppercase">Abonelik</dt>
            <dd className="text-sm text-gray-900 mt-0.5">
              <span className="font-semibold">{planLabel(item.plan_type)}</span>
              {" · "}
              Bitiş: <span className="font-semibold">{formatDate(subscriptionEnds)}</span>
              {item.status && (
                <>
                  {" · "}
                  Kayıt durumu: <span className="font-semibold">{item.status}</span>
                </>
              )}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  );
}
