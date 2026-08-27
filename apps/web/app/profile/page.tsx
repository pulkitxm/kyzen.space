import type { AvatarConfig } from "@kyzen/avatar";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ProfilePageView } from "@/app/[username]/profile-ui";
import { serverFetchJson } from "@/lib/api-server";
import { getServerSession } from "@/lib/get-server-session";
import {
  mapApiRowsToActivity,
  PROFILE_ACTIVITY_PAGE_SIZE,
  type ProfileActivityApiRow,
} from "@/lib/profile-activity-games";
import {
  buildStatGames,
  type ProfileStats,
  pickMostPlayed,
  totalGamesPlayed,
} from "@/lib/profile-stats";
import { memberForLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your profile · Kyzen",
};

type MeResponse = {
  profile: {
    userId: string;
    username: string;
    stats: ProfileStats;
    avatar: AvatarConfig | null;
    createdAt: string;
  };
};

type ProfileResponse = {
  profile: {
    userId: string;
    username: string;
    displayName: string | null;
    stats: ProfileStats;
    avatar: AvatarConfig | null;
    createdAt: string;
  };
  games: ProfileActivityApiRow[];
};

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session?.user) redirect("/auth");

  const me = await serverFetchJson<MeResponse>("/api/profiles/me");
  if (!me?.profile?.username) notFound();

  const data = await serverFetchJson<ProfileResponse>(
    `/api/profiles/${encodeURIComponent(me.profile.username)}`,
  );

  const profile = data?.profile ?? {
    ...me.profile,
    displayName: session.user.name ?? null,
  };
  const games = data?.games ?? [];
  const stats = profile.stats ?? {};
  const statGames = buildStatGames(stats);

  const memberLabel = memberForLabel(profile.createdAt);

  const activity = mapApiRowsToActivity(games);
  const activityRecentHasMore = activity.length > PROFILE_ACTIVITY_PAGE_SIZE;

  return (
    <ProfilePageView
      username={profile.username}
      displayName={profile.displayName}
      avatar={profile.avatar}
      isOwnProfile={true}
      memberForLabel={memberLabel}
      totalGamesPlayed={totalGamesPlayed(stats)}
      activityMostPlayed={pickMostPlayed(statGames)}
      activityRecentGamesInitial={activity.slice(0, PROFILE_ACTIVITY_PAGE_SIZE)}
      activityRecentHasMore={activityRecentHasMore}
    />
  );
}
