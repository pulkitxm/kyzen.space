import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    "@kyzen/shared",
    "@kyzen/games-core",
    "@kyzen/games-client",
  ],
};

export default nextConfig;
