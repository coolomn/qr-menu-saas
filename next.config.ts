import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { buildSecurityHeaderRules } from "./lib/security/headers";
import { buildDomainAfterFilesRewrites, buildDomainRedirects } from "./lib/domains/routing-rules";

const defaultDevOrigins = [
  "127.0.0.1",
  "localhost",
  "192.168.1.5",
  "192.168.1.103",
  "192.168.1.191",
];

const extraDevOrigins = (process.env.LOCAL_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedDevOrigins = [...new Set([...defaultDevOrigins, ...extraDevOrigins])];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  allowedDevOrigins,
  async headers() {
    return buildSecurityHeaderRules({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      isDev: process.env.NODE_ENV === "development",
    });
  },
  // Alan adı ayrımı: app.tapmenu.com.tr (panel), qr.tapmenu.com.tr/{slug} (menü). Ayrıntı: lib/domains/.
  async redirects() {
    return buildDomainRedirects();
  },
  async rewrites() {
    return { beforeFiles: [], afterFiles: buildDomainAfterFilesRewrites(), fallback: [] };
  },
};

export default withSentryConfig(nextConfig, {
  org: "us-kreatif",
  project: "tapmenu",
  // Kaynak haritası yükleme anahtarı (gizli). Yoksa yükleme atlanır, uygulama yine çalışır.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  // Tarayıcı olaylarını kendi alan adımız üzerinden gönder (app/monitoring/route.ts).
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});

