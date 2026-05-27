import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase, waitForBrowserSession } from "@/lib/supabase/browser";

/** Giriş / şifre sonrası yönlendirme — yalnızca güvenli admin path'leri. */
export function isSafeAdminNextPath(path: string | null): path is string {
  if (!path) return false;
  if (!path.startsWith("/admin")) return false;
  if (path.startsWith("/admin/login")) return false;
  if (path.startsWith("/admin/auth/")) return false;
  return true;
}

export function getSafeAdminNextFromLocation(): string {
  if (typeof window === "undefined") return "/admin";
  const next = new URLSearchParams(window.location.search).get("next");
  return isSafeAdminNextPath(next) ? next : "/admin";
}

export function buildInviteSetPasswordUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/admin/auth/set-password`;
}

function parseHashParams(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw);
}

const SUPABASE_AUTH_ERROR_CODES = new Set([
  "otp_expired",
  "otp_disabled",
  "validation_failed",
  "flow_state_expired",
  "flow_state_not_found",
]);

/** Supabase Auth callback hata parametreleri (genel ?error= değil). */
export function hasSupabaseAuthCallbackInUrl(search: string, hash: string): boolean {
  const params = new URLSearchParams(search);
  const hashParams = parseHashParams(hash);

  const code = params.get("error_code") || hashParams.get("error_code");
  if (code && SUPABASE_AUTH_ERROR_CODES.has(code)) return true;

  const error = params.get("error") || hashParams.get("error");
  if (error === "access_denied" && (code || params.get("error_description") || hashParams.get("error_description"))) {
    return true;
  }

  return false;
}

/** Davet / recovery / implicit flow token'ları URL'de mi? */
export function hasAuthTokensInUrl(search: string, hash: string): boolean {
  const params = new URLSearchParams(search);
  const hashParams = parseHashParams(hash);

  if (params.get("token_hash")?.trim()) return true;

  for (const key of ["access_token", "refresh_token", "token_hash"] as const) {
    if (hashParams.get(key)?.trim()) return true;
  }

  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (/access_token=|refresh_token=/.test(rawHash)) return true;

  return false;
}

/** Supabase redirect hata query'si (expired / invalid). */
export function authCallbackErrorMessage(search: string, hash: string): string | null {
  if (!hasSupabaseAuthCallbackInUrl(search, hash)) return null;

  const params = new URLSearchParams(search);
  const hashParams = parseHashParams(hash);
  const code = params.get("error_code") || hashParams.get("error_code");

  if (code === "otp_expired" || /expired/i.test(code ?? "")) {
    return "Davet bağlantısının süresi dolmuş. Yöneticinizden yeni bir davet isteyin.";
  }
  if (code === "otp_disabled" || /invalid/i.test(code ?? "")) {
    return "Davet bağlantısı geçersiz. Yöneticinizden yeni bir davet isteyin.";
  }

  return "Davet bağlantısı geçersiz veya süresi dolmuş olabilir. Yöneticinizden yeni davet isteyin.";
}

/** Yalnızca gerçek invite/recovery callback URL'lerinde login → set-password. */
export function shouldRedirectLoginToSetPassword(search: string, hash: string): boolean {
  if (hasSupabaseAuthCallbackInUrl(search, hash)) return true;
  if (hasAuthTokensInUrl(search, hash)) return true;
  return false;
}

export function setPasswordUrlPreservingAuthParams(): string {
  return `/admin/auth/set-password${window.location.search}${window.location.hash}`;
}

/** Hash'i adres çubuğundan kaldırır (token görünürlüğünü azaltır). */
export function stripHashFromUrl(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** token_hash query'sini temizler (session kurulduktan sonra). */
export function stripInviteQueryFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("token_hash");
  url.searchParams.delete("type");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

/**
 * Davet / recovery linkinden oturum kurar (hash veya token_hash).
 */
export async function resolveInviteSession(): Promise<{
  session: Session | null;
  errorMessage: string | null;
}> {
  if (typeof window === "undefined") {
    return { session: null, errorMessage: "Tarayıcı oturumu kullanılamıyor." };
  }

  const search = window.location.search;
  const hash = window.location.hash;

  const callbackError = authCallbackErrorMessage(search, hash);
  if (callbackError) {
    return { session: null, errorMessage: callbackError };
  }

  const supabase = getBrowserSupabase();
  const params = new URLSearchParams(search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type");

  if (tokenHash && (type === "invite" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    stripInviteQueryFromUrl();
    if (error) {
      return {
        session: null,
        errorMessage:
          "Davet bağlantısı geçersiz veya süresi dolmuş olabilir. Yöneticinizden yeni davet isteyin.",
      };
    }
  }

  const {
    data: { session: immediate },
  } = await supabase.auth.getSession();
  if (immediate) {
    if (hash) stripHashFromUrl();
    return { session: immediate, errorMessage: null };
  }

  const sessionFromWait = await waitForBrowserSession({ maxAttempts: 25, delayMs: 120 });
  if (sessionFromWait) {
    if (hash) stripHashFromUrl();
    return { session: sessionFromWait, errorMessage: null };
  }

  const sessionFromListener = await new Promise<Session | null>((resolve) => {
    let settled = false;
    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      subscription.unsubscribe();
      resolve(session);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session);
    });

    window.setTimeout(() => finish(null), 4000);
  });

  if (sessionFromListener) {
    if (hash) stripHashFromUrl();
    return { session: sessionFromListener, errorMessage: null };
  }

  return {
    session: null,
    errorMessage:
      "Davet bağlantısı geçersiz veya süresi dolmuş olabilir. Yöneticinizden yeni davet isteyin.",
  };
}
