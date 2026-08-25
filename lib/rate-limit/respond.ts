import { NextResponse } from "next/server";

const RATE_LIMIT_ERROR_MESSAGE = "Çok fazla istek gönderildi. Lütfen birazdan tekrar deneyin.";

/** İç hata veya Upstash detaylarını sızdırmaz; sabit mesaj + Retry-After döner. */
export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds));
  return NextResponse.json(
    { error: RATE_LIMIT_ERROR_MESSAGE },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
