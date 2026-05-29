import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import {
  type GameStat,
  type ProfileStats,
  type UserProfileRow,
  user,
  userProfile,
} from "../schema";

export async function getDisplayName(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.name ?? null;
}

export async function getProfileByUserId(
  userId: string,
): Promise<UserProfileRow | null> {
  const [row] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getProfileByUsername(
  username: string,
): Promise<UserProfileRow | null> {
  const [row] = await db
    .select()
    .from(userProfile)
    .where(sql`lower(${userProfile.username}) = lower(${username})`)
    .limit(1);
  return row ?? null;
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userProfile.id })
    .from(userProfile)
    .where(sql`lower(${userProfile.username}) = lower(${username})`)
    .limit(1);
  return Boolean(row);
}

export async function createProfile(input: {
  userId: string;
  username: string;
}): Promise<UserProfileRow> {
  const [row] = await db
    .insert(userProfile)
    .values({ userId: input.userId, username: input.username, stats: {} })
    .returning();
  return row!;
}

const EMPTY_STAT: GameStat = { played: 0, won: 0, lost: 0, drawn: 0 };

export async function bumpStats(
  userId: string,
  gameType: string,
  outcome: "won" | "lost" | "drawn",
): Promise<void> {
  const profile = await getProfileByUserId(userId);
  if (!profile) return;
  const stats: ProfileStats = { ...(profile.stats ?? {}) };
  const cur = stats[gameType] ?? { ...EMPTY_STAT };
  stats[gameType] = {
    played: cur.played + 1,
    won: cur.won + (outcome === "won" ? 1 : 0),
    lost: cur.lost + (outcome === "lost" ? 1 : 0),
    drawn: cur.drawn + (outcome === "drawn" ? 1 : 0),
  };
  await db
    .update(userProfile)
    .set({ stats, updatedAt: new Date() })
    .where(eq(userProfile.userId, userId));
}
