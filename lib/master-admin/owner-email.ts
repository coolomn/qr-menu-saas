import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeEmailForOwner(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmailForOwner(email);
  return normalized.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = normalizeEmailForOwner(email);
  let page = 1;
  const perPage = 1000;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers failed:", error);
      return null;
    }

    const users = data?.users ?? [];
    const found = users.find((user) => user.email?.toLowerCase() === target);
    if (found?.id) return found.id;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}
