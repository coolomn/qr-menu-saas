export const PUBLIC_MENU_UNAVAILABLE_MESSAGE = "Bu menü şu anda kullanılamıyor.";

/** Public QR menü: süresi dolmuş veya pasif restoranlar kapalı. */
export function isPublicMenuBlocked(params: {
  tenant_status?: string | null;
  subscription_ends_at?: string | null;
}): boolean {
  const status = (params.tenant_status ?? "active").toLowerCase();
  if (status === "suspended" || status === "expired") {
    return true;
  }

  const endsAt = params.subscription_ends_at;
  if (endsAt == null || endsAt === "") {
    return false;
  }

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) {
    return false;
  }

  return end.getTime() < Date.now();
}
