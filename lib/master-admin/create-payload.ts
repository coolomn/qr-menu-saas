import type { PlanType } from "@/lib/master-admin/plans";
import { isValidEmail } from "@/lib/master-admin/owners";
import { isValidSlug, normalizeSlugInput } from "@/lib/master-admin/slug";

export type OwnerCreationMode = "invite" | "temporary_password";

export type CreateRestaurantPayload = {
  name: string;
  slug: string;
  owner_email: string;
  owner_creation_mode: OwnerCreationMode;
  plan_type: PlanType;
  starts_at?: string | null;
  ends_at?: string | null;
  max_products?: number | null;
  max_categories?: number | null;
  max_imports?: number | null;
  import_period?: "monthly" | "lifetime";
  admin_notes?: string | null;
};

const PLAN_TYPES: PlanType[] = ["legacy", "6_months", "12_months", "custom"];

function parseOptionalLimit(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export function parseCreateRestaurantBody(
  body: unknown
): { ok: true; data: CreateRestaurantPayload } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek gövdesi." };
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const slugInput = typeof raw.slug === "string" ? raw.slug.trim() : "";
  const ownerEmail = typeof raw.owner_email === "string" ? raw.owner_email.trim() : "";
  const modeRaw =
    typeof raw.owner_creation_mode === "string" ? raw.owner_creation_mode.trim() : "invite";
  const ownerCreationMode: OwnerCreationMode =
    modeRaw === "temporary_password" ? "temporary_password" : "invite";
  const planType = typeof raw.plan_type === "string" ? raw.plan_type.trim() : "";

  if (!name) return { ok: false, error: "Restoran adı zorunlu." };
  if (!slugInput) return { ok: false, error: "Slug zorunlu." };
  if (!ownerEmail) return { ok: false, error: "Owner e-postası zorunlu." };
  if (!isValidEmail(ownerEmail)) return { ok: false, error: "Geçerli bir owner e-postası girin." };
  if (!PLAN_TYPES.includes(planType as PlanType)) {
    return { ok: false, error: "Geçersiz plan tipi." };
  }

  const slug = normalizeSlugInput(slugInput);
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: "Slug yalnızca küçük harf, rakam ve tire içerebilir (en az 2 karakter).",
    };
  }

  const maxProducts = parseOptionalLimit(raw.max_products);
  const maxCategories = parseOptionalLimit(raw.max_categories);
  const maxImports = parseOptionalLimit(raw.max_imports);
  if (maxProducts === "invalid" || maxCategories === "invalid" || maxImports === "invalid") {
    return { ok: false, error: "Limitler negatif olmayan tam sayı olmalı veya boş bırakılmalı." };
  }

  const importPeriod = raw.import_period === "lifetime" ? "lifetime" : "monthly";
  const startsAt = typeof raw.starts_at === "string" && raw.starts_at ? raw.starts_at : null;
  const endsAt = typeof raw.ends_at === "string" && raw.ends_at ? raw.ends_at : null;
  const adminNotes =
    typeof raw.admin_notes === "string" && raw.admin_notes.trim() ? raw.admin_notes.trim() : null;

  if (planType === "custom" && endsAt) {
    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) {
      return { ok: false, error: "Geçersiz bitiş tarihi." };
    }
    if (startsAt) {
      const start = new Date(startsAt);
      if (!Number.isNaN(start.getTime()) && end <= start) {
        return { ok: false, error: "Bitiş tarihi başlangıçtan sonra olmalı." };
      }
    }
  }

  return {
    ok: true,
    data: {
      name,
      slug,
      owner_email: ownerEmail,
      owner_creation_mode: ownerCreationMode,
      plan_type: planType as PlanType,
      starts_at: startsAt,
      ends_at: endsAt,
      max_products: maxProducts,
      max_categories: maxCategories,
      max_imports: maxImports,
      import_period: importPeriod,
      admin_notes: adminNotes,
    },
  };
}
