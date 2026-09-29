import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Allow LAN / tunnel hosts to use dev HMR (fixes webpack-hmr cross-origin block). Add more IPs if needed. */
  allowedDevOrigins: ["172.16.16.22", "10.179.234.103"],
  
  /** Increase API body size limit for file attachments (default is 1MB) */
  serverExternalPackages: [],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
