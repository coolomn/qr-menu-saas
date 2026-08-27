import { NextResponse } from "next/server";
import {
  isEmailIdentifier,
  isValidLoginUsername,
  normalizeLoginUsername,
} from "@/lib/admin-auth/login-username";
import { resolveOwnerEmailByLoginUsername } from "@/lib/admin-auth/resolve-owner-email-by-username";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { evaluateResolveLoginEmailRateLimit } from "@/lib/rate-limit/resolve-login-email";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";

export const runtime = "nodejs";

type Body = {
  username?: string;
};

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const raw = typeof body.username === "string" ? body.username.trim() : "";
  if (!raw || isEmailIdentifier(raw)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const username = normalizeLoginUsername(raw);
  if (!isValidLoginUsername(username)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rateLimit = await evaluateResolveLoginEmailRateLimit(getClientIp(request), username);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const svc = tryCreateServiceSupabase();
  if (!svc.ok) {
    return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  }

  const resolved = await resolveOwnerEmailByLoginUsername(svc.client, username);
  if (!resolved) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ email: resolved.email, restaurantId: resolved.restaurantId });
}
