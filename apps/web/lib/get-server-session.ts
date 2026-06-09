import { cache } from "react";
import { serverFetchJson } from "@/lib/api-server";

type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type ServerSession = {
  user: SessionUser;
  session: { id: string; token?: string };
} | null;

export const getServerSession = cache(async (): Promise<ServerSession> => {
  return serverFetchJson<ServerSession>("/api/auth/get-session");
});
