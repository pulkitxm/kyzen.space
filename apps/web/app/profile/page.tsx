import { redirect } from "next/navigation";

import { serverFetchJson } from "@/lib/api-server";

export const dynamic = "force-dynamic";

export default async function ProfileRedirectPage() {
  const me = await serverFetchJson<{ profile: { username: string } }>(
    "/api/profiles/me",
  );
  if (!me?.profile?.username) redirect("/auth");
  redirect(`/${me.profile.username}`);
}
