import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type AllergenSuggestRateLimitDecision =
  | { allowed: true }
  | { allowed: false; kind: "limited"; retryAfterSeconds: number }
  | { allowed: false; kind: "unavailable" };

export type AllergenSuggestRateLimitDeps = {
  getDailyLimiter: () => RateLimiterLike | null;
  getShortLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultDeps: AllergenSuggestRateLimitDeps = {
  getDailyLimiter: () => tryGetLimiter("allergenSuggestDaily"),
  getShortLimiter: () => tryGetLimiter("allergenSuggestShort"),
  checkLimit,
};

/**
 * Önce günlük tavan, sonra kısa pencere kontrol edilir.
 * Fail-closed: limiter yoksa veya checkLimit "unavailable" dönerse istek reddedilir —
 * bu özellik OpenAI maliyeti taşıyor ve kritik değil, owner ürünü AI önerisi olmadan da kaydedebilir.
 */
export async function evaluateAllergenSuggestRateLimit(
  userId: string,
  deps: AllergenSuggestRateLimitDeps = defaultDeps
): Promise<AllergenSuggestRateLimitDecision> {
  const dailyLimiter = deps.getDailyLimiter();
  if (!dailyLimiter) {
    return { allowed: false, kind: "unavailable" };
  }

  const dailyResult = await deps.checkLimit(dailyLimiter, userId);
  if (dailyResult.state === "unavailable") {
    return { allowed: false, kind: "unavailable" };
  }
  if (dailyResult.state === "limited") {
    return { allowed: false, kind: "limited", retryAfterSeconds: dailyResult.retryAfterSeconds };
  }

  const shortLimiter = deps.getShortLimiter();
  if (!shortLimiter) {
    return { allowed: false, kind: "unavailable" };
  }

  const shortResult = await deps.checkLimit(shortLimiter, userId);
  if (shortResult.state === "unavailable") {
    return { allowed: false, kind: "unavailable" };
  }
  if (shortResult.state === "limited") {
    return { allowed: false, kind: "limited", retryAfterSeconds: shortResult.retryAfterSeconds };
  }

  return { allowed: true };
}
