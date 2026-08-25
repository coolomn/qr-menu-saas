import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type MenuImportRateLimitDecision =
  | { allowed: true }
  | { allowed: false; kind: "limited"; retryAfterSeconds: number }
  | { allowed: false; kind: "unavailable" };

export type MenuImportRateLimitDeps = {
  getLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultAnalyzeDeps: MenuImportRateLimitDeps = {
  getLimiter: () => tryGetLimiter("menuImportAnalyze"),
  checkLimit,
};

const defaultContinueDeps: MenuImportRateLimitDeps = {
  getLimiter: () => tryGetLimiter("menuImportContinue"),
  checkLimit,
};

/**
 * user+restaurant başına saatte 5 yeni analiz.
 * Fail-closed: limiter yoksa veya Upstash'e erişilemezse analiz başlatılmaz.
 */
export async function evaluateMenuImportAnalyzeRateLimit(
  userId: string,
  restaurantId: string,
  deps: MenuImportRateLimitDeps = defaultAnalyzeDeps
): Promise<MenuImportRateLimitDecision> {
  const limiter = deps.getLimiter();
  if (!limiter) {
    return { allowed: false, kind: "unavailable" };
  }

  const result = await deps.checkLimit(limiter, `${userId}:${restaurantId}`);
  if (result.state === "unavailable") {
    return { allowed: false, kind: "unavailable" };
  }
  if (result.state === "limited") {
    return { allowed: false, kind: "limited", retryAfterSeconds: result.retryAfterSeconds };
  }
  return { allowed: true };
}

/**
 * Kullanıcı başına dakikada 60 job-continue çağrısı.
 * Fail-closed: limiter yoksa veya Upstash'e erişilemezse job ilerletilmez —
 * bu kontrol job satırına herhangi bir yazma yapılmadan önce çalışır.
 */
export async function evaluateMenuImportContinueRateLimit(
  userId: string,
  deps: MenuImportRateLimitDeps = defaultContinueDeps
): Promise<MenuImportRateLimitDecision> {
  const limiter = deps.getLimiter();
  if (!limiter) {
    return { allowed: false, kind: "unavailable" };
  }

  const result = await deps.checkLimit(limiter, userId);
  if (result.state === "unavailable") {
    return { allowed: false, kind: "unavailable" };
  }
  if (result.state === "limited") {
    return { allowed: false, kind: "limited", retryAfterSeconds: result.retryAfterSeconds };
  }
  return { allowed: true };
}
