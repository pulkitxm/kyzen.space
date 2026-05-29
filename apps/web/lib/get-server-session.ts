import { cache } from "react";
import { headers } from "next/headers";
import { ensureMongoConnected } from "@/database";
import { getAuth } from "@/lib/auth";

export const getServerSession = cache(async () => {
  await ensureMongoConnected();
  return getAuth().api.getSession({
    headers: await headers(),
  });
});
