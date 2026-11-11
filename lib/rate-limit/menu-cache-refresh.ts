import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type MenuCacheRefreshRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type MenuCacheRefreshRateLimitDeps = {
  getLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultDeps: MenuCacheRefreshRateLimitDeps = {
  getLimiter: () => tryGetLimiter("menuCacheRefresh"),
  checkLimit,
};

/**
 * Kullanıcı başına dakikada 30 önbellek yenileme.
 * Fail-open: Upstash yoksa/erişilemezse izin verilir — yenileme zararsızdır ve
 * engellenirse sahibin kaydı menüye geç yansır.
 */
export async function evaluateMenuCacheRefreshRateLimit(
  userId: string,
  deps: MenuCacheRefreshRateLimitDeps = defaultDeps
): Promise<MenuCacheRefreshRateLimitDecision> {
  const limiter = deps.getLimiter();
  if (!limiter) return { allowed: true };

  const result = await deps.checkLimit(limiter, userId);
  if (result.state === "limited") {
    return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
  }
  if (result.state === "unavailable") {
    console.warn("[rate-limit] menu-cache-refresh: check unavailable, failing open", result.reason);
  }
  return { allowed: true };
}
