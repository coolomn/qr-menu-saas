/**
 * Sentry ortak ayarları (tarayıcı + sunucu).
 * DSN gizli değildir (tarayıcıya zaten gider); env ile değiştirilebilir.
 * Kişisel veri (IP, çerez, istek gövdesi) gönderilmez: dataCollection/sendDefaultPii verilmiyor,
 * SDK'nın muhafazakâr varsayılanları geçerli.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  "https://e80234f885ff2e2d2333f9da40067c6c@o4512375673192448.ingest.de.sentry.io/4512375699669072";

/** Vercel'de "production" / "preview"; yerelde "development". */
export function sentryEnvironment(vercelEnv: string | undefined): string {
  return vercelEnv || "development";
}

export function sentryBaseOptions(vercelEnv: string | undefined) {
  const environment = sentryEnvironment(vercelEnv);
  return {
    dsn: SENTRY_DSN,
    environment,
    // Yalnızca derlenmiş uygulamada (next build/start, Vercel) çalışır; `next dev` hatalarını göndermez.
    enabled: process.env.NODE_ENV === "production",
    // Canlıda isteklerin %10'u için performans izi; diğer ortamlarda hepsi.
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
  };
}
