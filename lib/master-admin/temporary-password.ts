import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidEmail, normalizeEmailForOwner } from "@/lib/master-admin/owners";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SPECIAL = "!@#$%&*";
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

/** Tek seferlik güçlü geçici şifre (DB/log’a yazılmaz). */
export function generateTemporaryPassword(length = 16): string {
  const bytes = randomBytes(length + 8);
  const required = [
    LOWER[bytes[0] % LOWER.length],
    UPPER[bytes[1] % UPPER.length],
    DIGITS[bytes[2] % DIGITS.length],
    SPECIAL[bytes[3] % SPECIAL.length],
  ];
  const rest: string[] = [];
  for (let i = 0; i < length - required.length; i++) {
    rest.push(ALL[bytes[4 + i] % ALL.length]);
  }
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[length + i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export type CreateOwnerWithTemporaryPasswordResult =
  | { ok: true; userId: string; temporaryPassword: string }
  | { ok: false; error: string };

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = normalizeEmailForOwner(email);
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("listUsers failed:", error.message);
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

/** Yeni owner hesabı; e-posta onaylı, davet maili yok. */
export async function createOwnerWithTemporaryPassword(
  admin: SupabaseClient,
  email: string
): Promise<CreateOwnerWithTemporaryPasswordResult> {
  if (!isValidEmail(email)) {
    return { ok: false, error: "Geçerli bir owner e-postası girin." };
  }

  const normalized = normalizeEmailForOwner(email);
  const existingId = await findUserIdByEmail(admin, normalized);
  if (existingId) {
    return {
      ok: false,
      error:
        "Bu e-posta zaten kayıtlı. Davet modunu kullanın veya farklı bir e-posta girin.",
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data, error } = await admin.auth.admin.createUser({
    email: normalized,
    password: temporaryPassword,
    email_confirm: true,
  });

  if (error) {
    const alreadyExists = /already|registered|exists/i.test(error.message);
    if (alreadyExists) {
      return {
        ok: false,
        error:
          "Bu e-posta zaten kayıtlı. Davet modunu kullanın veya farklı bir e-posta girin.",
      };
    }
    console.error("createUser failed:", error.message);
    return { ok: false, error: error.message || "Owner hesabı oluşturulamadı." };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { ok: false, error: "Hesap oluşturuldu ancak kullanıcı kimliği alınamadı." };
  }

  return { ok: true, userId, temporaryPassword };
}
