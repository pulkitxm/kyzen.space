import { cache } from "react";
import { serverFetchJson } from "@/lib/api-server";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type ServerSession = {
  user: SessionUser;
  session: { id: string; token?: string };
} | null;

/**
 * Current session via the backend's Better Auth endpoint, forwarding cookies.
 * Cached per-request so multiple components share one round-trip.
 */
export const getServerSession = cache(async (): Promise<ServerSession> => {
  return serverFetchJson<ServerSession>("/api/auth/get-session");
});
