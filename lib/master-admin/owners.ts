import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerCreationMode } from "@/lib/master-admin/create-payload";
import {
  findUserIdByEmail,
  isValidEmail,
  normalizeEmailForOwner,
} from "@/lib/master-admin/owner-email";
import { createOwnerWithTemporaryPassword } from "@/lib/master-admin/temporary-password";

export type ResolveOwnerResult =
  | { ok: true; userId: string; invited: boolean }
  | { ok: false; error: string };

export type ResolveOwnerForCreateResult =
  | {
      ok: true;
      userId: string;
      createdOwner: boolean;
      linkedExistingOwner: boolean;
      ownerInvited: boolean;
      temporaryPassword?: string;
      message?: string;
    }
  | { ok: false; error: string };

export { isValidEmail, normalizeEmailForOwner, findUserIdByEmail } from "@/lib/master-admin/owner-email";

function normalizeEmail(email: string): string {
  return normalizeEmailForOwner(email);
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

const LINKED_EXISTING_OWNER_MESSAGE =
  "Bu e-posta zaten kayıtlı. Restoran mevcut kullanıcıya bağlandı.";

/** Yeni restoran için owner: mevcut hesabı bağlar veya moda göre yeni hesap açar. */
export async function resolveOwnerForRestaurantCreation(
  admin: SupabaseClient,
  email: string,
  mode: OwnerCreationMode,
  redirectTo: string
): Promise<ResolveOwnerForCreateResult> {
  if (!isValidEmail(email)) {
    return { ok: false, error: "Geçerli bir owner e-postası girin." };
  }

  const normalized = normalizeEmailForOwner(email);
  const existingId = await findUserIdByEmail(admin, normalized);

  if (existingId) {
    return {
      ok: true,
      userId: existingId,
      createdOwner: false,
      linkedExistingOwner: true,
      ownerInvited: false,
      message: LINKED_EXISTING_OWNER_MESSAGE,
    };
  }

  if (mode === "temporary_password") {
    const created = await createOwnerWithTemporaryPassword(admin, normalized);
    if (!created.ok) {
      return { ok: false, error: created.error };
    }
    return {
      ok: true,
      userId: created.userId,
      createdOwner: true,
      linkedExistingOwner: false,
      ownerInvited: false,
      temporaryPassword: created.temporaryPassword,
    };
  }

  const invited = await resolveOwnerByEmail(admin, normalized, redirectTo);
  if (!invited.ok) {
    return { ok: false, error: invited.error };
  }

  return {
    ok: true,
    userId: invited.userId,
    createdOwner: invited.invited,
    linkedExistingOwner: false,
    ownerInvited: invited.invited,
  };
}
