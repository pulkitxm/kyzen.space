import type { AvatarConfig } from "@gamelobby/avatar";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { ChatMode } from "../../lib/chat-layout";
import type { PatternId } from "../../lib/pattern";
import type { ColorMode, ThemeId } from "../../lib/theme";
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
  avatar?: AvatarConfig | null;
}): Promise<UserProfileRow> {
  const [row] = await db
    .insert(userProfile)
    .values({
      userId: input.userId,
      username: input.username,
      stats: {},
      avatar: input.avatar ?? null,
    })
    .returning();
  return row!;
}

export async function updateAvatar(
  userId: string,
  avatar: AvatarConfig,
): Promise<void> {
  await db
    .update(userProfile)
    .set({ avatar, updatedAt: new Date() })
    .where(eq(userProfile.userId, userId));
}

export async function updateAppearance(
  userId: string,
  patch: { theme?: ThemeId; colorMode?: ColorMode; pattern?: PatternId },
): Promise<void> {
  const set: {
    theme?: ThemeId;
    colorMode?: ColorMode;
    pattern?: PatternId;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (patch.theme !== undefined) set.theme = patch.theme;
  if (patch.colorMode !== undefined) set.colorMode = patch.colorMode;
  if (patch.pattern !== undefined) set.pattern = patch.pattern;
  await db.update(userProfile).set(set).where(eq(userProfile.userId, userId));
}

export async function updateChatLayout(
  userId: string,
  layout: { mode: ChatMode },
): Promise<void> {
  await db
    .update(userProfile)
    .set({ chatLayout: layout, updatedAt: new Date() })
    .where(eq(userProfile.userId, userId));
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

/** A user as exposed to other users (id, username, display name, avatar). */
export type PublicUserRow = {
  id: string;
  username: string;
  displayName: string | null;
  avatar: AvatarConfig | null;
};

const PUBLIC_USER_COLUMNS = {
  id: userProfile.userId,
  username: userProfile.username,
  displayName: user.name,
  avatar: userProfile.avatar,
} as const;

export async function getPublicUsers(
  userIds: string[],
): Promise<PublicUserRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select(PUBLIC_USER_COLUMNS)
    .from(userProfile)
    .innerJoin(user, eq(userProfile.userId, user.id))
    .where(inArray(userProfile.userId, userIds));
}

export async function getPublicUser(
  userId: string,
): Promise<PublicUserRow | null> {
  const [row] = await getPublicUsers([userId]);
  return row ?? null;
}

export async function searchByUsername(
  query: string,
  viewerId: string,
  limit = 20,
): Promise<PublicUserRow[]> {
  const term = `%${query.replace(/[%_\\]/g, "")}%`;
  return db
    .select(PUBLIC_USER_COLUMNS)
    .from(userProfile)
    .innerJoin(user, eq(userProfile.userId, user.id))
    .where(
      and(
        sql`lower(${userProfile.username}) like lower(${term})`,
        ne(userProfile.userId, viewerId),
      ),
    )
    .limit(limit);
}
