import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Allow LAN / tunnel hosts to use dev HMR (fixes webpack-hmr cross-origin block). Add more IPs if needed. */
  allowedDevOrigins: ["172.16.16.22"],
};

export default nextConfig;
