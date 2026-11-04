import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "@/lib/sentry/options";

Sentry.init({
  ...sentryBaseOptions(process.env.NEXT_PUBLIC_VERCEL_ENV),
  // Vercel önizlemeleri parola korumalı; /monitoring isteği kendi alan adımıza gittiği için
  // oturum çerezinin gitmesi gerekir. Tünel route'u çerezi Sentry'ye iletmez.
  transportOptions: { fetchOptions: { credentials: "same-origin" } },
});

// App Router sayfa geçişlerini performans izine bağlar.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
