import { cache } from "react";
import { headers } from "next/headers";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";

export const getAccountSessions = cache(async () => {
  await ensureMongoConnected();
  const h = await headers();
  const auth = getAuth();

  const current = await auth.api.getSession({
    headers: h,
  });

  if (!current?.session || !current.user) {
    return {
      current: current,
      list: [],
    };
  }

  const list = await auth.api.listSessions({
    headers: h,
  });

  const sorted = [...list].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return { current, list: sorted };
});
