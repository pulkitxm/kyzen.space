import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The shared game packages ship raw TS/TSX (logic in games-core, React UI in
  // games-client); Next must transpile them since web imports their source.
  transpilePackages: ["@gamelobby/games-core", "@gamelobby/games-client"],
};

export default nextConfig;
