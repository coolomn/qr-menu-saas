import { isPublicMenuBlocked } from "@/lib/public-menu/subscription-gate";

export type TenantLockState =
  | { locked: false }
  | { locked: true; reason: "suspended" | "expired"; endsAt: string | null };

/**
 * Admin panelinin kilitlenip kilitlenmeyeceği. Kural, QR menünün kapanmasıyla birebir aynı
 * (isPublicMenuBlocked); burada yalnızca ekranda doğru mesaj için sebep ayrıştırılır.
 */
export function getTenantLockState(row: {
  tenant_status?: string | null;
  subscription_ends_at?: string | null;
}): TenantLockState {
  if (!isPublicMenuBlocked(row)) return { locked: false };
  const status = (row.tenant_status ?? "").toLowerCase();
  return {
    locked: true,
    reason: status === "suspended" ? "suspended" : "expired",
    endsAt: row.subscription_ends_at ?? null,
  };
}

/** "5 Kasım 2026" gibi; geçersiz tarihte null. */
export function formatLockDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
}
