import {
  isEmailIdentifier,
  isValidLoginUsername,
  normalizeLoginUsername,
} from "@/lib/admin-auth/login-username";
import type {
  ServerSignInConfig,
  ServerSignInResult,
} from "@/lib/admin-auth/server-password-sign-in";
import type { OwnerLoginRateLimitDecision } from "@/lib/rate-limit/owner-login";

export const MAX_PASSWORD_LENGTH = 200;
/** Supabase 429 döndüğünde gerçek süre bilinmiyor; makul bir bekleme önerilir. */
export const SUPABASE_RATE_LIMIT_RETRY_SECONDS = 60;

export type LoginUsernameDeps = {
  evaluateRateLimit: (ip: string, username: string) => Promise<OwnerLoginRateLimitDecision>;
  getSignInConfig: () => ServerSignInConfig | null;
  /** null = kullanıcı adı yok; veritabanı hatasında fırlatır. Yapılandırma eksikse "unavailable". */
  resolveOwner: (
    username: string
  ) => Promise<{ email: string; restaurantId: string } | null | "unavailable">;
  signIn: (
    config: ServerSignInConfig,
    credentials: { email: string; password: string },
    clientIp: string | null
  ) => Promise<ServerSignInResult>;
  onMissingSecretKey?: () => void;
};

export type LoginUsernameOutcome =
  | { kind: "ok"; access_token: string; refresh_token: string; restaurantId: string }
  | { kind: "invalid_credentials" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "unavailable" };

/**
 * Kullanıcı adı + şifre → yalnız oturum anahtarları. Sahibin e-postası asla dönmez.
 * Kullanıcı adı yok / şifre yanlış / geçersiz istek aynı sonucu verir.
 */
export async function handleLoginUsername(
  body: unknown,
  clientIp: string | null,
  deps: LoginUsernameDeps
): Promise<LoginUsernameOutcome> {
  const input = (body && typeof body === "object" ? body : {}) as {
    username?: unknown;
    password?: unknown;
  };
  const raw = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!raw || isEmailIdentifier(raw) || !password || password.length > MAX_PASSWORD_LENGTH) {
    return { kind: "invalid_credentials" };
  }

  const username = normalizeLoginUsername(raw);
  if (!isValidLoginUsername(username)) {
    return { kind: "invalid_credentials" };
  }

  const rateLimit = await deps.evaluateRateLimit(clientIp ?? "unknown", username);
  if (!rateLimit.allowed) {
    return { kind: "rate_limited", retryAfterSeconds: rateLimit.retryAfterSeconds };
  }

  const config = deps.getSignInConfig();
  if (!config) return { kind: "unavailable" };
  if (!config.forwardClientIp) deps.onMissingSecretKey?.();

  let owner: Awaited<ReturnType<LoginUsernameDeps["resolveOwner"]>>;
  try {
    owner = await deps.resolveOwner(username);
  } catch {
    return { kind: "unavailable" };
  }
  if (owner === "unavailable") return { kind: "unavailable" };
  if (!owner) return { kind: "invalid_credentials" };

  const result = await deps.signIn(config, { email: owner.email, password }, clientIp);
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      return { kind: "rate_limited", retryAfterSeconds: SUPABASE_RATE_LIMIT_RETRY_SECONDS };
    }
    if (result.reason === "unavailable") return { kind: "unavailable" };
    return { kind: "invalid_credentials" };
  }

  return {
    kind: "ok",
    access_token: result.session.access_token,
    refresh_token: result.session.refresh_token,
    restaurantId: owner.restaurantId,
  };
}
