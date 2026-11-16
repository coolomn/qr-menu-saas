import { evaluateAllergenSuggestRateLimit, type AllergenSuggestRateLimitDecision } from "./allergen-suggest";
import { checkLimit } from "./client";
import { tryGetLimiter } from "./limiters";

/**
 * Faz 2.5b AI çeviri kotası: alerjen önerisiyle aynı iki kademeli kural (önce dakikalık, sonra günlük),
 * fail-closed (Redis yoksa istek reddedilir — OpenAI maliyeti taşır, işletme elle çevirebilir).
 */
export function evaluateAiTranslateRateLimit(userId: string): Promise<AllergenSuggestRateLimitDecision> {
  return evaluateAllergenSuggestRateLimit(userId, {
    getShortLimiter: () => tryGetLimiter("aiTranslateShort"),
    getDailyLimiter: () => tryGetLimiter("aiTranslateDaily"),
    checkLimit,
  });
}
