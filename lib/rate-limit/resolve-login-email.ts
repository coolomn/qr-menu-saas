import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type ResolveLoginEmailRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type ResolveLoginEmailRateLimitDeps = {
  getIpLimiter: () => RateLimiterLike | null;
  getUsernameLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultDeps: ResolveLoginEmailRateLimitDeps = {
  getIpLimiter: () => tryGetLimiter("resolveLoginEmailIp"),
  getUsernameLimiter: () => tryGetLimiter("resolveLoginEmailUsername"),
  checkLimit,
};

/**
 * Önce IP, sonra normalize edilmiş username bazlı limit kontrol edilir.
 * Fail-open: limiter yoksa veya Upstash'e erişilemezse istek normal akışına devam eder —
 * bu endpoint login öncesi genel kullanılabilirlik için kritik, brute-force riski limitli.
 */
export async function evaluateResolveLoginEmailRateLimit(
  ip: string,
  username: string,
  deps: ResolveLoginEmailRateLimitDeps = defaultDeps
): Promise<ResolveLoginEmailRateLimitDecision> {
  const ipLimiter = deps.getIpLimiter();
  if (!ipLimiter) {
    console.warn("[rate-limit] resolve-login-email: IP limiter unavailable, failing open");
  } else {
    const ipResult = await deps.checkLimit(ipLimiter, ip);
    if (ipResult.state === "unavailable") {
      console.warn(
        "[rate-limit] resolve-login-email: IP check unavailable, failing open",
        ipResult.reason
      );
    } else if (ipResult.state === "limited") {
      return { allowed: false, retryAfterSeconds: ipResult.retryAfterSeconds };
    }
  }

  const normalizedUsername = username.trim().toLowerCase();

  const usernameLimiter = deps.getUsernameLimiter();
  if (!usernameLimiter) {
    console.warn("[rate-limit] resolve-login-email: username limiter unavailable, failing open");
    return { allowed: true };
  }

  const usernameResult = await deps.checkLimit(usernameLimiter, normalizedUsername);
  if (usernameResult.state === "unavailable") {
    console.warn(
      "[rate-limit] resolve-login-email: username check unavailable, failing open",
      usernameResult.reason
    );
    return { allowed: true };
  }
  if (usernameResult.state === "limited") {
    return { allowed: false, retryAfterSeconds: usernameResult.retryAfterSeconds };
  }

  return { allowed: true };
}
