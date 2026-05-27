import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInviteSetPasswordUrl } from "@/lib/admin-auth/invite-flow";
import { generateTemporaryPassword } from "@/lib/master-admin/temporary-password";
import { isValidEmail, normalizeEmailForOwner } from "@/lib/master-admin/owners";

export type OwnerPasswordResetMode = "email" | "temporary_password";

export function parseOwnerPasswordResetBody(
  body: unknown
): { ok: true; mode: OwnerPasswordResetMode } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Geçersiz istek gövdesi." };
  }
  const mode = (body as { mode?: unknown }).mode;
  if (mode === "email" || mode === "temporary_password") {
    return { ok: true, mode };
  }
  return { ok: false, error: "mode: email veya temporary_password olmalı." };
}

export type SendOwnerRecoveryEmailResult =
  | { ok: true; ownerEmail: string; sentAt: string }
  | { ok: false; error: string };

async function ensureOwnerEmailConfirmed(
  admin: SupabaseClient,
  ownerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.auth.admin.updateUserById(ownerId, {
    email_confirm: true,
  });
  if (error) {
    console.error("updateUserById email_confirm failed:", error.message);
    return { ok: false, error: error.message || "Owner hesabı doğrulanamadı." };
  }
  return { ok: true };
}

/** Mevcut owner için şifre sıfırlama e-postası (recovery → set-password). */
export async function sendOwnerRecoveryEmail(
  admin: SupabaseClient,
  ownerId: string,
  ownerEmail: string,
  origin: string
): Promise<SendOwnerRecoveryEmailResult> {
  if (!ownerId) {
    return { ok: false, error: "Bu restorana bağlı owner hesabı yok." };
  }
  if (!isValidEmail(ownerEmail)) {
    return { ok: false, error: "Owner e-postası geçersiz." };
  }

  const email = normalizeEmailForOwner(ownerEmail);
  const redirectTo = buildInviteSetPasswordUrl(origin);
  const confirmed = await ensureOwnerEmailConfirmed(admin, ownerId);
  if (!confirmed.ok) {
    return { ok: false, error: confirmed.error };
  }

  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    console.error("resetPasswordForEmail failed:", error.message);
    return { ok: false, error: error.message || "Sıfırlama e-postası gönderilemedi." };
  }

  return { ok: true, ownerEmail: email, sentAt: new Date().toISOString() };
}

export type SetOwnerTemporaryPasswordResult =
  | { ok: true; ownerEmail: string; temporaryPassword: string }
  | { ok: false; error: string };

/** Mevcut owner şifresini günceller (tek seferlik yanıt). */
export async function setOwnerTemporaryPassword(
  admin: SupabaseClient,
  ownerId: string,
  ownerEmail: string
): Promise<SetOwnerTemporaryPasswordResult> {
  if (!ownerId) {
    return { ok: false, error: "Bu restorana bağlı owner hesabı yok." };
  }

  const temporaryPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(ownerId, {
    password: temporaryPassword,
    email_confirm: true,
  });

  if (error) {
    console.error("updateUserById password failed:", error.message);
    return { ok: false, error: error.message || "Şifre güncellenemedi." };
  }

  const email = isValidEmail(ownerEmail)
    ? normalizeEmailForOwner(ownerEmail)
    : ownerEmail.trim().toLowerCase();

  return { ok: true, ownerEmail: email, temporaryPassword };
}
