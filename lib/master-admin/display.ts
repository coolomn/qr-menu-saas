/** ends_at geçmişte ve restoran suspended değilse süre dolmuş sayılır (görsel). */
export function isSubscriptionExpired(
  endsAt: string | null | undefined,
  tenantStatus?: string | null,
  subscriptionStatus?: string | null
): boolean {
  if (tenantStatus === "suspended" || subscriptionStatus === "suspended") {
    return false;
  }
  if (!endsAt) return false;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() < Date.now();
}

export function effectiveDisplayStatus(
  tenantStatus: string,
  subscriptionStatus: string | null,
  endsAt: string | null | undefined
): string {
  if (tenantStatus === "suspended" || subscriptionStatus === "suspended") {
    return "suspended";
  }
  if (isSubscriptionExpired(endsAt, tenantStatus, subscriptionStatus)) {
    return "expired";
  }
  return tenantStatus === "expired" || subscriptionStatus === "expired"
    ? "expired"
    : "active";
}

export function statusBadgeClass(displayStatus: string): string {
  if (displayStatus === "active") return "bg-green-100 text-green-800";
  if (displayStatus === "suspended") return "bg-amber-100 text-amber-800";
  if (displayStatus === "expired") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-700";
}

export function statusLabel(displayStatus: string): string {
  if (displayStatus === "active") return "Aktif";
  if (displayStatus === "suspended") return "Pasif";
  if (displayStatus === "expired") return "Süre doldu";
  return displayStatus;
}
