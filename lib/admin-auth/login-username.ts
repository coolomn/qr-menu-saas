export const LOGIN_USERNAME_MIN_LENGTH = 3;
export const LOGIN_USERNAME_MAX_LENGTH = 32;

const LOGIN_USERNAME_RE = /^[a-z0-9_-]+$/;

export function normalizeLoginUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidLoginUsername(raw: string): boolean {
  const username = normalizeLoginUsername(raw);
  return (
    username.length >= LOGIN_USERNAME_MIN_LENGTH &&
    username.length <= LOGIN_USERNAME_MAX_LENGTH &&
    LOGIN_USERNAME_RE.test(username)
  );
}

export function validateLoginUsername(raw: string): string | null {
  const username = normalizeLoginUsername(raw);
  if (!username) return "Kullanıcı adı zorunlu.";
  if (username.length < LOGIN_USERNAME_MIN_LENGTH) {
    return `Kullanıcı adı en az ${LOGIN_USERNAME_MIN_LENGTH} karakter olmalı.`;
  }
  if (username.length > LOGIN_USERNAME_MAX_LENGTH) {
    return `Kullanıcı adı en fazla ${LOGIN_USERNAME_MAX_LENGTH} karakter olabilir.`;
  }
  if (!LOGIN_USERNAME_RE.test(username)) {
    return "Kullanıcı adı yalnızca küçük harf, rakam, tire ve alt çizgi içerebilir.";
  }
  return null;
}

/** Slug tabanlı otomatik öneri (master create formu). */
export function suggestLoginUsernameFromSlug(slug: string): string {
  const base = normalizeLoginUsername(slug.replace(/\s+/g, "-"));
  const cleaned = base.replace(/[^a-z0-9_-]/g, "").slice(0, LOGIN_USERNAME_MAX_LENGTH);
  return cleaned.length >= LOGIN_USERNAME_MIN_LENGTH ? cleaned : cleaned.padEnd(LOGIN_USERNAME_MIN_LENGTH, "0");
}

export function isEmailIdentifier(raw: string): boolean {
  return raw.includes("@");
}
