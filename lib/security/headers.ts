/**
 * Güvenlik başlıkları (next.config.ts → headers()).
 *
 * - Zararsız başlıklar her sayfada zorunlu.
 * - Admin paneli başka sitelerin iframe'ine gömülemez (clickjacking).
 *   Public menü (/menu/...) gömülebilir kalır: işletmeler menüyü kendi sitelerine koyabilir.
 * - CSP şimdilik yalnızca "Report-Only": hiçbir şeyi engellemez, ihlalleri tarayıcı
 *   konsoluna yazar. Konsol temiz kalınca zorunlu hale getirilecek.
 */

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(params: {
  supabaseUrl?: string;
  isDev?: boolean;
}): string {
  const supabase = originOf(params.supabaseUrl);
  const supabaseHosts = [supabase, "https://*.supabase.co"].filter(Boolean).join(" ");
  const supabaseWs = [supabase?.replace(/^http/, "ws"), "wss://*.supabase.co"].filter(Boolean).join(" ");

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline'${params.isDev ? " 'unsafe-eval'" : ""}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": `'self' data: blob: ${supabaseHosts} https://images.unsplash.com https://api.qrserver.com`,
    "font-src": "'self' data:",
    "connect-src": `'self' ${supabaseHosts} ${supabaseWs} https://api.mymemory.translated.net`,
    "media-src": `'self' blob: ${supabaseHosts}`,
    "worker-src": "'self' blob:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join("; ");
}

export function buildSecurityHeaderRules(params: {
  supabaseUrl?: string;
  isDev?: boolean;
}): HeaderRule[] {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
        },
        {
          key: "Content-Security-Policy-Report-Only",
          value: buildContentSecurityPolicy(params),
        },
      ],
    },
    {
      // "/admin/:path*" hem /admin hem alt sayfaları kapsar.
      source: "/admin/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ],
    },
  ];
}
