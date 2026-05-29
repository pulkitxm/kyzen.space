import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
