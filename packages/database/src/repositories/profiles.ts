import type {
  AvatarConfig,
  ChatMode,
  ColorMode,
  CreateProfileInput,
  GameStat,
  GameType,
  GlassMode,
  PatternId,
  ProfileStats,
  PublicUserRow,
  ThemeId,
  UserProfileRow,
} from "@gamelobby/shared/types";
import {
  appearancePatchSchema,
  createProfileInputSchema,
} from "@gamelobby/shared/types";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../client";
import { user, userProfile } from "../schema";

export async function isAnonymousUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.isAnonymous ?? false;
}

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

export async function getTakenUsernames(
  usernames: string[],
): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();
  const lowered = usernames.map((name) => name.toLowerCase());
  const rows = await db
    .select({ username: userProfile.username })
    .from(userProfile)
    .where(inArray(sql`lower(${userProfile.username})`, lowered));
  return new Set(rows.map((row) => row.username.toLowerCase()));
}

export async function createProfile(
  input: CreateProfileInput,
): Promise<UserProfileRow> {
  createProfileInputSchema.parse(input);
  const [row] = await db
    .insert(userProfile)
    .values({
      userId: input.userId,
      username: input.username,
      stats: {},
      avatar: input.avatar ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to create profile");
  return row;
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

export async function setDisplayName(
  userId: string,
  name: string,
): Promise<void> {
  await db
    .update(user)
    .set({ name, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export async function updateUsername(
  userId: string,
  username: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(userProfile)
    .set({ username, usernameChangedAt: now, updatedAt: now })
    .where(eq(userProfile.userId, userId));
}

export async function updateAppearance(
  userId: string,
  patch: {
    theme?: ThemeId;
    colorMode?: ColorMode;
    pattern?: PatternId;
    glass?: GlassMode;
  },
): Promise<void> {
  appearancePatchSchema.parse(patch);
  const set: {
    theme?: ThemeId;
    colorMode?: ColorMode;
    pattern?: PatternId;
    glass?: GlassMode;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };
  if (patch.theme !== undefined) set.theme = patch.theme;
  if (patch.colorMode !== undefined) set.colorMode = patch.colorMode;
  if (patch.pattern !== undefined) set.pattern = patch.pattern;
  if (patch.glass !== undefined) set.glass = patch.glass;
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
  gameType: GameType,
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

export async function touchLastSeen(
  userIds: string[],
  when: Date,
): Promise<void> {
  if (userIds.length === 0) return;
  await db
    .update(userProfile)
    .set({ lastSeenAt: when })
    .where(inArray(userProfile.userId, userIds));
}

export async function getLastSeen(
  userIds: string[],
): Promise<Map<string, Date | null>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: userProfile.userId, lastSeenAt: userProfile.lastSeenAt })
    .from(userProfile)
    .where(inArray(userProfile.userId, userIds));
  return new Map(rows.map((r) => [r.userId, r.lastSeenAt]));
}
