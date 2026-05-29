import { cache } from "react";
import { serverFetchJson } from "@/lib/api-server";

export type AccountSession = {
  id: string;
  token?: string;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AccountSessionsResponse = {
  current: {
    session: { id: string; token?: string };
    user: { id: string; email?: string | null; name?: string | null };
  };
  sessions: AccountSession[];
};

/** Current session + all active sessions, from the backend account API. */
export const getAccountSessions = cache(async () => {
  const data = await serverFetchJson<AccountSessionsResponse>(
    "/api/account/sessions",
  );
  if (!data) return { current: null, list: [] as AccountSession[] };
  return { current: data.current, list: data.sessions };
});
