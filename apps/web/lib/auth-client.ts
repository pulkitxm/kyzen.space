import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client points at the Express backend (cross-origin in dev:
 * web :3000 → api :4000). Cookies flow because the server sets them with the
 * right attributes and CORS allows credentials.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
});
