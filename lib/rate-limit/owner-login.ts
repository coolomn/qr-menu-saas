import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type OwnerLoginRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type OwnerLoginRateLimitDeps = {
  getIpLimiter: () => RateLimiterLike | null;
  getIpUsernameLimiter: () => RateLimiterLike | null;
  getUsernameLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultDeps: OwnerLoginRateLimitDeps = {
  getIpLimiter: () => tryGetLimiter("ownerLoginIp"),
  getIpUsernameLimiter: () => tryGetLimiter("ownerLoginIpUsername"),
  getUsernameLimiter: () => tryGetLimiter("ownerLoginUsername"),
  checkLimit,
};

/**
 * Sıra: IP → IP+kullanıcı adı → kullanıcı adı (üst sınır). İlk aşılan limitte durur.
 * Fail-open: limiter yoksa veya Upstash'e erişilemezse istek devam eder —
 * kullanıcı adıyla giriş (login-username) erişilebilir kalmalı; arkada Supabase Auth'un kendi
 * IP başına giriş limiti (Sb-Forwarded-For ile müşteri IP'si) yedek koruma olarak durur.
 */
export async function evaluateOwnerLoginRateLimit(
  ip: string,
  username: string,
  deps: OwnerLoginRateLimitDeps = defaultDeps
): Promise<OwnerLoginRateLimitDecision> {
  const normalizedUsername = username.trim().toLowerCase();
  const checks: Array<{ label: string; getLimiter: () => RateLimiterLike | null; identifier: string }> = [
    { label: "IP", getLimiter: deps.getIpLimiter, identifier: ip },
    { label: "IP+username", getLimiter: deps.getIpUsernameLimiter, identifier: `${ip}|${normalizedUsername}` },
    { label: "username", getLimiter: deps.getUsernameLimiter, identifier: normalizedUsername },
  ];

  for (const check of checks) {
    const limiter = check.getLimiter();
    if (!limiter) {
      console.warn(`[rate-limit] owner-login: ${check.label} limiter unavailable, failing open`);
      continue;
    }
    const result = await deps.checkLimit(limiter, check.identifier);
    if (result.state === "unavailable") {
      console.warn(
        `[rate-limit] owner-login: ${check.label} check unavailable, failing open`,
        result.reason
      );
      continue;
    }
    if (result.state === "limited") {
      return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
    }
  }

  return { allowed: true };
}
