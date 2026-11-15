import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type OwnerLoginRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type OwnerLoginRateLimitDeps = {
  getIpLimiter: () => RateLimiterLike | null;
  getUsernameLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultDeps: OwnerLoginRateLimitDeps = {
  getIpLimiter: () => tryGetLimiter("ownerLoginIp"),
  getUsernameLimiter: () => tryGetLimiter("ownerLoginUsername"),
  checkLimit,
};

/**
 * Önce IP, sonra normalize edilmiş username bazlı limit kontrol edilir.
 * Fail-open: limiter yoksa veya Upstash'e erişilemezse istek normal akışına devam eder —
 * kullanıcı adıyla giriş (login-username) erişilebilir kalmalı; arkada Supabase Auth'un kendi
 * IP başına giriş limiti (Sb-Forwarded-For ile müşteri IP'si) yedek koruma olarak durur.
 */
export async function evaluateOwnerLoginRateLimit(
  ip: string,
  username: string,
  deps: OwnerLoginRateLimitDeps = defaultDeps
): Promise<OwnerLoginRateLimitDecision> {
  const ipLimiter = deps.getIpLimiter();
  if (!ipLimiter) {
    console.warn("[rate-limit] owner-login: IP limiter unavailable, failing open");
  } else {
    const ipResult = await deps.checkLimit(ipLimiter, ip);
    if (ipResult.state === "unavailable") {
      console.warn(
        "[rate-limit] owner-login: IP check unavailable, failing open",
        ipResult.reason
      );
    } else if (ipResult.state === "limited") {
      return { allowed: false, retryAfterSeconds: ipResult.retryAfterSeconds };
    }
  }

  const normalizedUsername = username.trim().toLowerCase();

  const usernameLimiter = deps.getUsernameLimiter();
  if (!usernameLimiter) {
    console.warn("[rate-limit] owner-login: username limiter unavailable, failing open");
    return { allowed: true };
  }

  const usernameResult = await deps.checkLimit(usernameLimiter, normalizedUsername);
  if (usernameResult.state === "unavailable") {
    console.warn(
      "[rate-limit] owner-login: username check unavailable, failing open",
      usernameResult.reason
    );
    return { allowed: true };
  }
  if (usernameResult.state === "limited") {
    return { allowed: false, retryAfterSeconds: usernameResult.retryAfterSeconds };
  }

  return { allowed: true };
}
