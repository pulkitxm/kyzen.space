import { redirect } from "next/navigation";

import { serverFetchJson } from "@/lib/api-server";

export const dynamic = "force-dynamic";

/**
 * Resolve the signed-in user's profile and redirect to their public page.
 * The backend provisions a username on first sign-in, so /api/profiles/me
 * always has one for an authenticated user.
 */
export default async function ProfileRedirectPage() {
  const me = await serverFetchJson<{ profile: { username: string } }>(
    "/api/profiles/me",
  );
  if (!me?.profile?.username) redirect("/auth");
  redirect(`/${me.profile.username}`);
}
