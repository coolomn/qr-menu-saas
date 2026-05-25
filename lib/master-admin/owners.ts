import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolveOwnerResult =
  | { ok: true; userId: string; invited: boolean }
  | { ok: false; error: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
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

/** Mevcut kullanıcıyı bağlar; yoksa davet e-postası gönderir. */
export async function resolveOwnerByEmail(
  admin: SupabaseClient,
  email: string,
  redirectTo: string
): Promise<ResolveOwnerResult> {
  if (!isValidEmail(email)) {
    return { ok: false, error: "Geçerli bir owner e-postası girin." };
  }

  const normalized = normalizeEmail(email);
  const existingId = await findUserIdByEmail(admin, normalized);
  if (existingId) {
    return { ok: true, userId: existingId, invited: false };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(normalized, {
    redirectTo,
  });

  if (error) {
    const alreadyExists = /already|registered|exists/i.test(error.message);
    if (alreadyExists) {
      const retryId = await findUserIdByEmail(admin, normalized);
      if (retryId) {
        return { ok: true, userId: retryId, invited: false };
      }
    }
    console.error("inviteUserByEmail failed:", error);
    return { ok: false, error: error.message || "Owner daveti gönderilemedi." };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { ok: false, error: "Davet sonrası kullanıcı kimliği alınamadı." };
  }

  return { ok: true, userId, invited: true };
}
