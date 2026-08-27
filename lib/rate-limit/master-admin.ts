import { checkLimit, type RateLimiterLike } from "./client";
import { tryGetLimiter } from "./limiters";

export type MasterAdminRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type MasterAdminMutationRateLimitDeps = {
  getLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultMutationDeps: MasterAdminMutationRateLimitDeps = {
  getLimiter: () => tryGetLimiter("masterAdminMutation"),
  checkLimit,
};

/**
 * Master admin başına dakikada 20 mutasyon (create/update/extend/toggle-status).
 * Fail-open: limiter yoksa veya Upstash'e erişilemezse istek normal akışına devam eder —
 * master admin sayısı azdır, bu kontrol kazara/otomasyon kaynaklı patlamalara karşı bir güvenlik ağı.
 */
export async function evaluateMasterAdminMutationRateLimit(
  userId: string,
  deps: MasterAdminMutationRateLimitDeps = defaultMutationDeps
): Promise<MasterAdminRateLimitDecision> {
  const limiter = deps.getLimiter();
  if (!limiter) {
    console.warn("[rate-limit] master-admin mutation: limiter unavailable, failing open");
    return { allowed: true };
  }

  const result = await deps.checkLimit(limiter, userId);
  if (result.state === "unavailable") {
    console.warn(
      "[rate-limit] master-admin mutation: check unavailable, failing open",
      result.reason
    );
    return { allowed: true };
  }
  if (result.state === "limited") {
    return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
  }
  return { allowed: true };
}

export type MasterAdminPasswordResetRateLimitDeps = {
  getAdminLimiter: () => RateLimiterLike | null;
  getRestaurantLimiter: () => RateLimiterLike | null;
  checkLimit: typeof checkLimit;
};

const defaultPasswordResetDeps: MasterAdminPasswordResetRateLimitDeps = {
  getAdminLimiter: () => tryGetLimiter("masterAdminPasswordResetByAdmin"),
  getRestaurantLimiter: () => tryGetLimiter("masterAdminPasswordResetByRestaurant"),
  checkLimit,
};

/**
 * İki bağımsız key: master admin başına saatte 5, restoran başına saatte 3 şifre sıfırlama.
 * Önce admin, sonra restaurant key'i kontrol edilir.
 * Fail-open: limiter yoksa veya Upstash'e erişilemezse istek normal akışına devam eder.
 */
export async function evaluateMasterAdminPasswordResetRateLimit(
  userId: string,
  restaurantId: string,
  deps: MasterAdminPasswordResetRateLimitDeps = defaultPasswordResetDeps
): Promise<MasterAdminRateLimitDecision> {
  const adminLimiter = deps.getAdminLimiter();
  if (!adminLimiter) {
    console.warn(
      "[rate-limit] master-admin password-reset: admin limiter unavailable, failing open"
    );
  } else {
    const adminResult = await deps.checkLimit(adminLimiter, userId);
    if (adminResult.state === "unavailable") {
      console.warn(
        "[rate-limit] master-admin password-reset: admin check unavailable, failing open",
        adminResult.reason
      );
    } else if (adminResult.state === "limited") {
      return { allowed: false, retryAfterSeconds: adminResult.retryAfterSeconds };
    }
  }

  const restaurantLimiter = deps.getRestaurantLimiter();
  if (!restaurantLimiter) {
    console.warn(
      "[rate-limit] master-admin password-reset: restaurant limiter unavailable, failing open"
    );
    return { allowed: true };
  }

  const restaurantResult = await deps.checkLimit(restaurantLimiter, restaurantId);
  if (restaurantResult.state === "unavailable") {
    console.warn(
      "[rate-limit] master-admin password-reset: restaurant check unavailable, failing open",
      restaurantResult.reason
    );
    return { allowed: true };
  }
  if (restaurantResult.state === "limited") {
    return { allowed: false, retryAfterSeconds: restaurantResult.retryAfterSeconds };
  }

  return { allowed: true };
}
