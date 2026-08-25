import { Ratelimit, type Duration } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";
import { tryGetRedisClient } from "./client";

export type RateLimitName =
  | "resolveLoginEmailIp"
  | "resolveLoginEmailUsername"
  | "allergenSuggestShort"
  | "allergenSuggestDaily"
  | "menuImportAnalyze"
  | "menuImportContinue"
  | "masterAdminMutation"
  | "masterAdminPasswordResetByAdmin"
  | "masterAdminPasswordResetByRestaurant";

export type RateLimitConfig =
  | { algorithm: "slidingWindow"; tokens: number; window: Duration; prefix: string }
  | { algorithm: "fixedWindow"; tokens: number; window: Duration; prefix: string }
  | {
      algorithm: "tokenBucket";
      refillRate: number;
      interval: Duration;
      maxTokens: number;
      prefix: string;
    };

/**
 * Faz 1 onaylı limit tablosu (bkz. proje planı).
 * Henüz hiçbir route bu limiter'ları kullanmıyor — yalnızca ortak altyapı.
 */
export const RATE_LIMIT_CONFIG: Record<RateLimitName, RateLimitConfig> = {
  resolveLoginEmailIp: {
    algorithm: "slidingWindow",
    tokens: 10,
    window: "1 m",
    prefix: "ratelimit:resolve-login-email:ip",
  },
  resolveLoginEmailUsername: {
    algorithm: "slidingWindow",
    tokens: 5,
    window: "1 m",
    prefix: "ratelimit:resolve-login-email:username",
  },
  allergenSuggestShort: {
    algorithm: "tokenBucket",
    refillRate: 20,
    interval: "1 m",
    maxTokens: 20,
    prefix: "ratelimit:allergen-suggest:short",
  },
  allergenSuggestDaily: {
    algorithm: "fixedWindow",
    tokens: 300,
    window: "1 d",
    prefix: "ratelimit:allergen-suggest:daily",
  },
  menuImportAnalyze: {
    algorithm: "slidingWindow",
    tokens: 5,
    window: "1 h",
    prefix: "ratelimit:menu-import:analyze",
  },
  menuImportContinue: {
    algorithm: "slidingWindow",
    tokens: 60,
    window: "1 m",
    prefix: "ratelimit:menu-import:continue",
  },
  masterAdminMutation: {
    algorithm: "tokenBucket",
    refillRate: 20,
    interval: "1 m",
    maxTokens: 20,
    prefix: "ratelimit:master-admin:mutation",
  },
  masterAdminPasswordResetByAdmin: {
    algorithm: "slidingWindow",
    tokens: 5,
    window: "1 h",
    prefix: "ratelimit:master-admin:password-reset:admin",
  },
  masterAdminPasswordResetByRestaurant: {
    algorithm: "slidingWindow",
    tokens: 3,
    window: "1 h",
    prefix: "ratelimit:master-admin:password-reset:restaurant",
  },
};

function buildLimiter(redis: Redis, config: RateLimitConfig): Ratelimit {
  const algorithm =
    config.algorithm === "slidingWindow"
      ? Ratelimit.slidingWindow(config.tokens, config.window)
      : config.algorithm === "fixedWindow"
        ? Ratelimit.fixedWindow(config.tokens, config.window)
        : Ratelimit.tokenBucket(config.refillRate, config.interval, config.maxTokens);

  return new Ratelimit({ redis, limiter: algorithm, prefix: config.prefix });
}

const limiterCache = new Map<RateLimitName, Ratelimit>();

/** Redis yapılandırılmamışsa null döner — çağıran taraf bunu "unavailable" olarak ele almalı. */
export function tryGetLimiter(name: RateLimitName): Ratelimit | null {
  const cached = limiterCache.get(name);
  if (cached) return cached;

  const redis = tryGetRedisClient();
  if (!redis) return null;

  const limiter = buildLimiter(redis, RATE_LIMIT_CONFIG[name]);
  limiterCache.set(name, limiter);
  return limiter;
}
