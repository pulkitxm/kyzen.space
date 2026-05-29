import type { NextConfig } from "next";

/**
 * The backend (Express + Better Auth + Hono) runs on its own origin. We proxy
 * all `/api/*` from the web origin to it so the whole app is same-origin in the
 * browser. This keeps the OAuth callback on the web origin
 * (http://localhost:3000/api/auth/callback/google) — matching the redirect URI
 * registered in Google — and avoids CORS for client fetches.
 *
 * WebSockets are NOT proxied here (Next rewrites don't upgrade ws); the realtime
 * client connects directly to NEXT_PUBLIC_SOCKET_URL.
 */
const API_ORIGIN = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
