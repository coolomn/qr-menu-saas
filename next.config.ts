import type { NextConfig } from "next";

const defaultDevOrigins = ["127.0.0.1", "localhost", "192.168.1.5", "192.168.1.103"];

const extraDevOrigins = (process.env.LOCAL_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedDevOrigins = [...new Set([...defaultDevOrigins, ...extraDevOrigins])];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  allowedDevOrigins,
};

export default nextConfig;

