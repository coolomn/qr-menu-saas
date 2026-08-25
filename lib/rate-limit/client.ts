import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;
let redisClientResolved = false;

function resolveRedisClient(): Redis | null {
  if (redisClientResolved) return redisClient;
  redisClientResolved = true;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

/** Env eksikse null döner — çağıran taraf bunu "unavailable" olarak ele almalı. */
export function tryGetRedisClient(): Redis | null {
  return resolveRedisClient();
}

/** @upstash/ratelimit'in Ratelimit.limit() ile aynı imzayı taşıyan herhangi bir nesne — test'te sahte bir limiter geçirilebilir. */
export type RateLimiterLike = {
  limit: (identifier: string) => Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
};

export type RateLimitCheckResult =
  | { state: "allowed"; limit: number; remaining: number; reset: number }
  | { state: "limited"; limit: number; retryAfterSeconds: number }
  | { state: "unavailable"; reason: string };

/**
 * limiter.limit() sonucunu allowed/limited/unavailable'a normalize eder.
 * Fail-open/fail-closed kararı burada verilmez — bu, çağıran endpoint policy katmanının sorumluluğu.
 */
export async function checkLimit(
  limiter: RateLimiterLike,
  identifier: string
): Promise<RateLimitCheckResult> {
  try {
    const result = await limiter.limit(identifier);
    if (result.success) {
      return {
        state: "allowed",
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
      };
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return { state: "limited", limit: result.limit, retryAfterSeconds };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    return { state: "unavailable", reason };
  }
}
