import { NextResponse } from "next/server";
import {
  isEmailIdentifier,
  isValidLoginUsername,
  normalizeLoginUsername,
} from "@/lib/admin-auth/login-username";
import { resolveOwnerEmailByLoginUsername } from "@/lib/admin-auth/resolve-owner-email-by-username";
import {
  getClientIpFromHeaders,
  resolveServerSignInConfig,
  signInWithPasswordOnServer,
} from "@/lib/admin-auth/server-password-sign-in";
import { tryCreateServiceSupabase } from "@/lib/supabase/service";
import { evaluateOwnerLoginRateLimit } from "@/lib/rate-limit/owner-login";
import { rateLimitedResponse } from "@/lib/rate-limit/respond";

export const runtime = "nodejs";

const MAX_PASSWORD_LENGTH = 200;
const NO_STORE = { "Cache-Control": "no-store" };

type Body = {
  username?: unknown;
  password?: unknown;
};

/** Kullanıcı adı yok / şifre yanlış / geçersiz istek: hepsi aynı cevap (kullanıcı adı taranamasın). */
function invalidCredentials() {
  return NextResponse.json({ error: "invalid_credentials" }, { status: 401, headers: NO_STORE });
}

function unavailable() {
  return NextResponse.json({ error: "service_unavailable" }, { status: 503, headers: NO_STORE });
}

let warnedMissingSecretKey = false;

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return invalidCredentials();
  }

  const raw = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!raw || isEmailIdentifier(raw) || !password || password.length > MAX_PASSWORD_LENGTH) {
    return invalidCredentials();
  }

  const username = normalizeLoginUsername(raw);
  if (!isValidLoginUsername(username)) {
    return invalidCredentials();
  }

  const clientIp = getClientIpFromHeaders(request.headers);
  const rateLimit = await evaluateOwnerLoginRateLimit(clientIp ?? "unknown", username);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterSeconds);
  }

  const signInConfig = resolveServerSignInConfig();
  const svc = tryCreateServiceSupabase();
  if (!signInConfig || !svc.ok) {
    return unavailable();
  }
  if (!signInConfig.forwardClientIp && !warnedMissingSecretKey) {
    warnedMissingSecretKey = true;
    console.warn(
      "[owner-login] SUPABASE_SECRET_KEY (sb_secret_) yok: anon anahtarla giriş yapılıyor, Supabase IP limiti Vercel IP'leri arasında paylaşılır"
    );
  }

  const resolved = await resolveOwnerEmailByLoginUsername(svc.client, username);
  if (!resolved) {
    return invalidCredentials();
  }

  const result = await signInWithPasswordOnServer(
    signInConfig,
    { email: resolved.email, password },
    clientIp
  );

  if (!result.ok) {
    if (result.reason === "rate_limited") return rateLimitedResponse(60);
    if (result.reason === "unavailable") return unavailable();
    return invalidCredentials();
  }

  return NextResponse.json(
    {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      restaurantId: resolved.restaurantId,
    },
    { headers: NO_STORE }
  );
}
