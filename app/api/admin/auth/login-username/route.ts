import { NextResponse } from "next/server";
import { handleLoginUsername } from "@/lib/admin-auth/login-username-handler";
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

const NO_STORE = { "Cache-Control": "no-store" };

let warnedMissingSecretKey = false;

function warnMissingSecretKey() {
  if (warnedMissingSecretKey) return;
  warnedMissingSecretKey = true;
  const message =
    "[owner-login] SUPABASE_SECRET_KEY (sb_secret_) yok: anon anahtarla giriş yapılıyor, Supabase IP limiti Vercel IP'leri arasında paylaşılır";
  if (process.env.VERCEL_ENV === "production") console.error(message);
  else console.warn(message);
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const outcome = await handleLoginUsername(body, getClientIpFromHeaders(request.headers), {
    evaluateRateLimit: evaluateOwnerLoginRateLimit,
    getSignInConfig: () => resolveServerSignInConfig(),
    resolveOwner: async (username) => {
      const svc = tryCreateServiceSupabase();
      if (!svc.ok) return "unavailable";
      return resolveOwnerEmailByLoginUsername(svc.client, username);
    },
    signIn: (config, credentials, clientIp) =>
      signInWithPasswordOnServer(config, credentials, clientIp),
    onMissingSecretKey: warnMissingSecretKey,
  });

  switch (outcome.kind) {
    case "ok":
      return NextResponse.json(
        {
          access_token: outcome.access_token,
          refresh_token: outcome.refresh_token,
          restaurantId: outcome.restaurantId,
        },
        { headers: NO_STORE }
      );
    case "rate_limited":
      return rateLimitedResponse(outcome.retryAfterSeconds);
    case "unavailable":
      return NextResponse.json({ error: "service_unavailable" }, { status: 503, headers: NO_STORE });
    default:
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401, headers: NO_STORE });
  }
}
