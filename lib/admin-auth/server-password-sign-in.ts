/**
 * Kullanıcı adıyla girişte şifre doğrulaması sunucuda yapılır; sahibin e-postası
 * tarayıcıya hiç gönderilmez (eski resolve-login-email ucu e-postayı açıkça döndürüyordu).
 *
 * Supabase Auth girişleri IP başına sınırlar. Sunucudan yapılan istekler Vercel IP'lerinden
 * çıktığı için gerçek müşteri IP'si `Sb-Forwarded-For` ile iletilir — bu başlık yalnızca yeni
 * `sb_secret_…` anahtarıyla ve panelde "IP Address Forwarding" açıkken dikkate alınır.
 * Secret anahtar yoksa anon anahtarla devam edilir (giriş çalışır, Supabase limiti Vercel IP'leri
 * arasında paylaşılır); bu durum loglanır.
 */

export type ServerSignInSession = {
  access_token: string;
  refresh_token: string;
};

export type ServerSignInResult =
  | { ok: true; session: ServerSignInSession }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" | "unavailable" };

export type ServerSignInConfig = {
  supabaseUrl: string;
  apiKey: string;
  /** true ise müşteri IP'si Sb-Forwarded-For ile iletilir (yalnız sb_secret_ anahtarla). */
  forwardClientIp: boolean;
};

const SECRET_KEY_PREFIX = "sb_secret_";

export function isSecretApiKey(key: string | undefined | null): key is string {
  return typeof key === "string" && key.trim().startsWith(SECRET_KEY_PREFIX);
}

/** Ortam değişkenlerinden giriş yapılandırmasını seçer; URL veya anahtar yoksa null. */
export function resolveServerSignInConfig(
  env: Record<string, string | undefined> = process.env
): ServerSignInConfig | null {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;

  const secretKey = env.SUPABASE_SECRET_KEY?.trim();
  if (isSecretApiKey(secretKey)) {
    return { supabaseUrl, apiKey: secretKey, forwardClientIp: true };
  }

  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) return null;
  return { supabaseUrl, apiKey: anonKey, forwardClientIp: false };
}

/** Basit IPv4/IPv6 biçim kontrolü — başlığa rastgele metin yazılmasın. */
export function isPlausibleIp(value: string): boolean {
  if (!value || value.length > 45) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return true;
  return /^[0-9a-fA-F:]+$/.test(value) && value.includes(":");
}

export async function signInWithPasswordOnServer(
  config: ServerSignInConfig,
  credentials: { email: string; password: string },
  clientIp: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<ServerSignInResult> {
  const headers: Record<string, string> = {
    apikey: config.apiKey,
    "Content-Type": "application/json",
  };
  if (config.forwardClientIp && clientIp && isPlausibleIp(clientIp)) {
    headers["Sb-Forwarded-For"] = clientIp;
  }

  const endpoint = `${config.supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (response.status >= 500) return { ok: false, reason: "unavailable" };
  if (!response.ok) return { ok: false, reason: "invalid_credentials" };

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const body = json as { access_token?: unknown; refresh_token?: unknown };
  if (
    typeof body.access_token !== "string" ||
    !body.access_token ||
    typeof body.refresh_token !== "string" ||
    !body.refresh_token
  ) {
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    session: { access_token: body.access_token, refresh_token: body.refresh_token },
  };
}

/** Vercel x-forwarded-for başlığını kendisi yazar; ilk değer müşteri IP'sidir. */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  const candidate = forwardedFor
    ? forwardedFor.split(",")[0].trim()
    : headers.get("x-real-ip")?.trim() || "";
  return candidate || null;
}
