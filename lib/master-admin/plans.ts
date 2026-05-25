export type PlanType = "legacy" | "6_months" | "12_months" | "custom";

export function addMonths(base: Date, months: number): Date {
  const date = new Date(base);
  date.setMonth(date.getMonth() + months);
  return date;
}

export function resolveSubscriptionDates(
  planType: PlanType,
  options?: { startsAt?: string | null; endsAt?: string | null }
): { starts_at: string; ends_at: string | null } {
  const starts_at = options?.startsAt
    ? new Date(options.startsAt).toISOString()
    : new Date().toISOString();
  const startDate = new Date(starts_at);

  if (Number.isNaN(startDate.getTime())) {
    throw new Error("Geçersiz başlangıç tarihi.");
  }

  switch (planType) {
    case "legacy":
      return { starts_at, ends_at: null };
    case "6_months":
      return { starts_at, ends_at: addMonths(startDate, 6).toISOString() };
    case "12_months":
      return { starts_at, ends_at: addMonths(startDate, 12).toISOString() };
    case "custom": {
      if (!options?.endsAt) {
        return { starts_at, ends_at: null };
      }
      const endDate = new Date(options.endsAt);
      if (Number.isNaN(endDate.getTime())) {
        throw new Error("Geçersiz bitiş tarihi.");
      }
      return { starts_at, ends_at: endDate.toISOString() };
    }
    default:
      throw new Error("Geçersiz plan tipi.");
  }
}
