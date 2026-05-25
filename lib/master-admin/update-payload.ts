import type { PlanType } from "@/lib/master-admin/plans";
import { isValidSlug, normalizeSlugInput } from "@/lib/master-admin/slug";

export type UpdateRestaurantPayload = {
  name?: string;
  slug?: string;
  plan_type?: PlanType;
  starts_at?: string | null;
  ends_at?: string | null;
  max_products?: number | null;
  max_categories?: number | null;
  max_imports?: number | null;
  import_period?: "monthly" | "lifetime";
  admin_notes?: string | null;
};

const PLAN_TYPES: PlanType[] = ["legacy", "6_months", "12_months", "custom"];

function parseOptionalLimit(value: unknown): number | null | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export function parseUpdateRestaurantBody(
  body: unknown
): { ok: true; data: UpdateRestaurantPayload } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek gövdesi." };
  }

  const raw = body as Record<string, unknown>;
  const data: UpdateRestaurantPayload = {};

  if ("name" in raw) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) return { ok: false, error: "Restoran adı boş olamaz." };
    data.name = name;
  }

  if ("slug" in raw) {
    const slugInput = typeof raw.slug === "string" ? raw.slug.trim() : "";
    if (!slugInput) return { ok: false, error: "Slug boş olamaz." };
    const slug = normalizeSlugInput(slugInput);
    if (!isValidSlug(slug)) {
      return {
        ok: false,
        error: "Slug yalnızca küçük harf, rakam ve tire içerebilir (en az 2 karakter).",
      };
    }
    data.slug = slug;
  }

  if ("plan_type" in raw) {
    const planType = typeof raw.plan_type === "string" ? raw.plan_type.trim() : "";
    if (!PLAN_TYPES.includes(planType as PlanType)) {
      return { ok: false, error: "Geçersiz plan tipi." };
    }
    data.plan_type = planType as PlanType;
  }

  if ("starts_at" in raw) {
    data.starts_at =
      typeof raw.starts_at === "string" && raw.starts_at ? raw.starts_at : null;
  }

  if ("ends_at" in raw) {
    data.ends_at = typeof raw.ends_at === "string" && raw.ends_at ? raw.ends_at : null;
  }

  if ("max_products" in raw) {
    const v = parseOptionalLimit(raw.max_products);
    if (v === "invalid") return { ok: false, error: "max_products geçersiz." };
    data.max_products = v;
  }

  if ("max_categories" in raw) {
    const v = parseOptionalLimit(raw.max_categories);
    if (v === "invalid") return { ok: false, error: "max_categories geçersiz." };
    data.max_categories = v;
  }

  if ("max_imports" in raw) {
    const v = parseOptionalLimit(raw.max_imports);
    if (v === "invalid") return { ok: false, error: "max_imports geçersiz." };
    data.max_imports = v;
  }

  if ("import_period" in raw) {
    data.import_period = raw.import_period === "lifetime" ? "lifetime" : "monthly";
  }

  if ("admin_notes" in raw) {
    data.admin_notes =
      typeof raw.admin_notes === "string" && raw.admin_notes.trim()
        ? raw.admin_notes.trim()
        : null;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "Güncellenecek alan yok." };
  }

  const planType = data.plan_type;
  const endsAt = data.ends_at;
  if (planType === "custom" && endsAt) {
    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) {
      return { ok: false, error: "Geçersiz bitiş tarihi." };
    }
    const startsAt = data.starts_at;
    if (startsAt) {
      const start = new Date(startsAt);
      if (!Number.isNaN(start.getTime()) && end <= start) {
        return { ok: false, error: "Bitiş tarihi başlangıçtan sonra olmalı." };
      }
    }
  }

  return { ok: true, data };
}
