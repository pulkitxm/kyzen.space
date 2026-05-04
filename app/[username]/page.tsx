import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  ProfilePageView,
  type ProfileActivityMost,
  type ProfileStatGame,
} from "@/app/[username]/profile-ui";
import { connectMongoose } from "@/database/mongoose";
import { Game, UserProfile } from "@/database/models";
import { findAuthUserDisplayName } from "@/lib/auth-user-display";
import { GAMES } from "@/lib/games";
import {
  mapGamesToProfileActivityRows,
  PROFILE_ACTIVITY_PAGE_SIZE,
} from "@/lib/profile-activity-games";
import { getServerSession } from "@/lib/get-server-session";
import { formatElapsedAsLargestUnit } from "@/lib/utils";

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  if (RESERVED.has(username.toLowerCase())) return {};

  await connectMongoose();
  const profile = await UserProfile.findOne({
    username: new RegExp(`^${escapeRegex(username)}$`, "i"),
  })
    .select({ username: 1 })
    .lean();

  if (!profile) return {};
  return {
    title: `${profile.username} · Game lib`,
    description: `Player profile for @${profile.username}`,
  };
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  if (RESERVED.has(username.toLowerCase())) notFound();

  const [session] = await Promise.all([getServerSession(), connectMongoose()]);

  const profile = await UserProfile.findOne({
    username: new RegExp(`^${escapeRegex(username)}$`, "i"),
  }).lean();

  if (!profile) notFound();

  const fetchCount = PROFILE_ACTIVITY_PAGE_SIZE + 1;

  const [recentGames, authUser] = await Promise.all([
    Game.find({ "players.userId": profile.userId })
      .sort({ updatedAt: -1 })
      .limit(fetchCount)
      .lean(),
    findAuthUserDisplayName(profile.userId),
  ]);

  const rawStats = profile.stats;
  const statsObj =
    rawStats &&
    typeof rawStats === "object" &&
    !(rawStats instanceof Map)
      ? (rawStats as Record<string, unknown>)
      : rawStats instanceof Map
        ? Object.fromEntries(rawStats.entries())
        : {};

  const statGames = buildStatGames(statsObj);

  const createdAt = new Date(
    (profile as { createdAt: Date | string }).createdAt,
  );
  const now = new Date();
  const memberForLabel = formatElapsedAsLargestUnit(
    now.getTime() - createdAt.getTime(),
  );

  const totalGamesPlayed = statGames.reduce((sum, g) => sum + g.played, 0);
  const mostPlayed = pickMostPlayed(statGames);

  const activityRecentHasMore = recentGames.length > PROFILE_ACTIVITY_PAGE_SIZE;
  const activityRecentGamesInitial = mapGamesToProfileActivityRows(
    recentGames.slice(0, PROFILE_ACTIVITY_PAGE_SIZE),
  );

  const isOwnProfile = session?.user?.id === profile.userId;

  return (
    <ProfilePageView
      username={profile.username}
      displayName={authUser?.name ?? null}
      isOwnProfile={isOwnProfile}
      memberForLabel={memberForLabel}
      totalGamesPlayed={totalGamesPlayed}
      activityMostPlayed={mostPlayed}
      activityRecentGamesInitial={activityRecentGamesInitial}
      activityRecentHasMore={activityRecentHasMore}
    />
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStatGames(statsObj: Record<string, unknown>): ProfileStatGame[] {
  return GAMES.map((g) => {
    const s = statsObj[g.id];
    const played =
      s && typeof s === "object"
        ? (() => {
            const p = (s as Record<string, unknown>).played;
            return typeof p === "number" && Number.isFinite(p) ? p : 0;
          })()
        : 0;
    return { id: g.id, name: g.name, href: g.href, coverImage: g.coverImage, played };
  });
}

function pickMostPlayed(statGames: ProfileStatGame[]): ProfileActivityMost | null {
  let best: ProfileStatGame | null = null;
  for (const g of statGames) {
    if (!best || g.played > best.played) best = g;
  }
  if (!best || best.played < 1) return null;
  return {
    id: best.id,
    name: best.name,
    href: best.href,
    coverImage: best.coverImage,
    played: best.played,
  };
}
