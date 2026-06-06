import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    "@gamelobby/shared",
    "@gamelobby/games-core",
    "@gamelobby/games-client",
  ],
};

export default nextConfig;
