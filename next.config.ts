import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  allowedDevOrigins: [

    "127.0.0.1",

    "localhost",

    "192.168.1.5",

  ],
};

export default nextConfig;

