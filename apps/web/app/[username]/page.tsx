import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProfilePageView } from "@/app/[username]/profile-ui";
import { serverFetchJson } from "@/lib/api-server";
import {
  mapApiRowsToActivity,
  PROFILE_ACTIVITY_PAGE_SIZE,
  type ProfileActivityApiRow,
} from "@/lib/profile-activity-games";
import {
  buildStatGames,
  pickMostPlayed,
  totalGamesPlayed,
  type ProfileStats,
} from "@/lib/profile-stats";
import { getServerSession } from "@/lib/get-server-session";
import { memberForLabel } from "@/lib/utils";

const RESERVED = new Set([
  "api",
  "auth",
  "account",
  "games",
  "profile",
  "_next",
  "favicon.ico",
]);

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

type ProfileResponse = {
  profile: {
    userId: string;
    username: string;
    displayName: string | null;
    stats: ProfileStats;
    createdAt: string;
  };
  games: ProfileActivityApiRow[];
};

async function fetchProfile(username: string): Promise<ProfileResponse | null> {
  return serverFetchJson<ProfileResponse>(
    `/api/profiles/${encodeURIComponent(username)}`,
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  if (RESERVED.has(username.toLowerCase())) return {};
  const data = await fetchProfile(username);
  if (!data) return {};
  return {
    title: `${data.profile.username} · GameLobby`,
    description: `Player profile for @${data.profile.username}`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  if (RESERVED.has(username.toLowerCase())) notFound();

  const [session, data] = await Promise.all([
    getServerSession(),
    fetchProfile(username),
  ]);
  if (!data) notFound();

  const { profile, games } = data;
  const stats = profile.stats ?? {};
  const statGames = buildStatGames(stats);

  const memberLabel = memberForLabel(profile.createdAt);

  const activity = mapApiRowsToActivity(games);
  const activityRecentHasMore = activity.length > PROFILE_ACTIVITY_PAGE_SIZE;

  return (
    <ProfilePageView
      username={profile.username}
      displayName={profile.displayName}
      isOwnProfile={session?.user?.id === profile.userId}
      memberForLabel={memberLabel}
      totalGamesPlayed={totalGamesPlayed(stats)}
      activityMostPlayed={pickMostPlayed(statGames)}
      activityRecentGamesInitial={activity.slice(0, PROFILE_ACTIVITY_PAGE_SIZE)}
      activityRecentHasMore={activityRecentHasMore}
    />
  );
}
