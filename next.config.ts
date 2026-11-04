import type { NextConfig } from "next";
import { buildSecurityHeaderRules } from "./lib/security/headers";

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
};

export default nextConfig;

