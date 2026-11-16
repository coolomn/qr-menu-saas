import { Ratelimit, type Duration } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";
import { tryGetRedisClient } from "./client";

export type RateLimitName =
  | "ownerLoginIp"
  | "ownerLoginIpUsername"
  | "ownerLoginUsername"
  | "allergenSuggestShort"
  | "allergenSuggestDaily"
  | "menuImportAnalyze"
  | "menuImportContinue"
  | "masterAdminMutation"
  | "masterAdminPasswordResetByAdmin"
  | "masterAdminPasswordResetByRestaurant"
  | "menuCacheRefresh"
  | "aiTranslateShort"
  | "aiTranslateDaily";

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
 * Route entegrasyonları: lib/rate-limit/*.ts (endpoint başına fail-open/fail-closed politikası).
 */
export const RATE_LIMIT_CONFIG: Record<RateLimitName, RateLimitConfig> = {
  ownerLoginIp: {
    algorithm: "slidingWindow",
    tokens: 30,
    window: "15 m",
    prefix: "ratelimit:owner-login:ip",
  },
  // Aynı IP'den aynı kullanıcı adına: tek saldırganın şifre denemesini keser.
  ownerLoginIpUsername: {
    algorithm: "slidingWindow",
    tokens: 10,
    window: "15 m",
    prefix: "ratelimit:owner-login:ip-username",
  },
  // Kullanıcı adı başına üst sınır (dağıtık deneme). Yüksek tutuldu: tek bir saldırgan
  // (≤30/IP) sahibi kullanıcı adı girişinden kilitleyemesin; e-postayla giriş her zaman açık.
  ownerLoginUsername: {
    algorithm: "slidingWindow",
    tokens: 50,
    window: "15 m",
    prefix: "ratelimit:owner-login:username",
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
    tokens: 200,
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
  menuCacheRefresh: {
    algorithm: "tokenBucket",
    refillRate: 30,
    interval: "1 m",
    maxTokens: 30,
    prefix: "ratelimit:menu-cache-refresh",
  },
  // Faz 2.5b: AI çeviri (istek başına en çok 30 öğe × 1 dil). Tam menü 10 dile ≈ 150–250 istek.
  aiTranslateShort: {
    algorithm: "tokenBucket",
    refillRate: 30,
    interval: "1 m",
    maxTokens: 30,
    prefix: "ratelimit:ai-translate:short",
  },
  aiTranslateDaily: {
    algorithm: "fixedWindow",
    tokens: 800,
    window: "1 d",
    prefix: "ratelimit:ai-translate:daily",
  },
};

/**
 * Preview ve production aynı Redis'i paylaşıyor; önizlemede yapılan denemeler
 * canlıdaki sayaçları tüketmesin diye anahtarlar ortama göre ayrılır.
 * Production'da prefix değişmez.
 */
export function envScopedPrefix(prefix: string, vercelEnv = process.env.VERCEL_ENV): string {
  if (!vercelEnv || vercelEnv === "production") return prefix;
  return `${vercelEnv}:${prefix}`;
}

function buildLimiter(redis: Redis, config: RateLimitConfig): Ratelimit {
  const algorithm =
    config.algorithm === "slidingWindow"
      ? Ratelimit.slidingWindow(config.tokens, config.window)
      : config.algorithm === "fixedWindow"
        ? Ratelimit.fixedWindow(config.tokens, config.window)
        : Ratelimit.tokenBucket(config.refillRate, config.interval, config.maxTokens);

  return new Ratelimit({
    redis,
    limiter: algorithm,
    prefix: envScopedPrefix(config.prefix),
    // Upstash yavaşsa isteği en fazla ~1.5 sn bekletir; zaman aşımı checkLimit'te "unavailable" olur.
    timeout: RATE_LIMIT_TIMEOUT_MS,
  });
}

export const RATE_LIMIT_TIMEOUT_MS = 1500;

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
