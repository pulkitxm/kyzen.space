import type {
  AccountMergeRow,
  AccountMergeStatus,
  FriendStatus,
} from "@gamelobby/shared/types";
import { recordAccountMergeInputSchema } from "@gamelobby/shared/types";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  accountMerge,
  conversation,
  conversationMember,
  friendship,
  game,
  gamePlayer,
  message,
  move,
  notification,
  user,
  userProfile,
} from "../schema";

export type AnonAccountSummary = {
  games: number;
  conversations: number;
  friends: number;
  statLines: number;
};

export async function recordPending(
  anonUserId: string,
  targetUserId: string,
): Promise<AccountMergeRow> {
  recordAccountMergeInputSchema.parse({ anonUserId, targetUserId });
  const [row] = await db
    .insert(accountMerge)
    .values({ anonUserId, targetUserId, status: "pending" })
    .returning();
  if (!row) throw new Error("Failed to record account merge");
  return row;
}

export async function getById(id: string): Promise<AccountMergeRow | null> {
  const [row] = await db
    .select()
    .from(accountMerge)
    .where(eq(accountMerge.id, id))
    .limit(1);
  return row ?? null;
}

export async function getPendingForTarget(
  targetUserId: string,
): Promise<AccountMergeRow | null> {
  const [row] = await db
    .select()
    .from(accountMerge)
    .where(
      and(
        eq(accountMerge.targetUserId, targetUserId),
        eq(accountMerge.status, "pending"),
      ),
    )
    .orderBy(sql`${accountMerge.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

export async function markResolved(
  id: string,
  status: Exclude<AccountMergeStatus, "pending">,
): Promise<AccountMergeRow | null> {
  const [row] = await db
    .update(accountMerge)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(accountMerge.id, id), eq(accountMerge.status, "pending")))
    .returning();
  return row ?? null;
}

export async function summarizeAnonAccount(
  anonUserId: string,
): Promise<AnonAccountSummary> {
  const [[gameCount], [convCount], [friendCount], [profile]] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(gamePlayer)
        .where(eq(gamePlayer.userId, anonUserId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(conversationMember)
        .where(eq(conversationMember.userId, anonUserId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(friendship)
        .where(
          or(
            eq(friendship.requesterId, anonUserId),
            eq(friendship.addresseeId, anonUserId),
          ),
        ),
      db
        .select({ stats: userProfile.stats })
        .from(userProfile)
        .where(eq(userProfile.userId, anonUserId))
        .limit(1),
    ]);
  return {
    games: gameCount?.count ?? 0,
    conversations: convCount?.count ?? 0,
    friends: friendCount?.count ?? 0,
    statLines: profile?.stats ? Object.keys(profile.stats).length : 0,
  };
}

export async function deleteAnonUserData(anonUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const seatedGameIds = await tx
      .select({ gameId: gamePlayer.gameId })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, anonUserId));
    const candidateGameIds = [...new Set(seatedGameIds.map((g) => g.gameId))];
    const soleGameIds: string[] = [];
    for (const gameId of candidateGameIds) {
      const [other] = await tx
        .select({ id: gamePlayer.id })
        .from(gamePlayer)
        .where(
          and(
            eq(gamePlayer.gameId, gameId),
            sql`${gamePlayer.userId} <> ${anonUserId}`,
          ),
        )
        .limit(1);
      if (!other) soleGameIds.push(gameId);
    }
    await tx.delete(gamePlayer).where(eq(gamePlayer.userId, anonUserId));
    await tx.delete(move).where(eq(move.playerId, anonUserId));
    if (soleGameIds.length > 0) {
      await tx.delete(game).where(inArray(game.id, soleGameIds));
    }
    await tx.delete(user).where(eq(user.id, anonUserId));
  });
}

const FRIEND_STATUS_RANK: Record<string, number> = {
  accepted: 3,
  pending: 2,
  declined: 1,
};

function betterFriendStatus(a: FriendStatus, b: FriendStatus): FriendStatus {
  return (FRIEND_STATUS_RANK[a] ?? 0) >= (FRIEND_STATUS_RANK[b] ?? 0) ? a : b;
}

function pairKeyOf(a: string, b: string): string {
  return [a, b].sort().join(":");
}

type StatLine = { played: number; won: number; lost: number; drawn: number };

function mergeStats(
  target: Record<string, StatLine>,
  anon: Record<string, StatLine>,
): Record<string, StatLine> {
  const out = { ...target };
  for (const [gameType, s] of Object.entries(anon)) {
    const cur = out[gameType] ?? { played: 0, won: 0, lost: 0, drawn: 0 };
    out[gameType] = {
      played: cur.played + s.played,
      won: cur.won + s.won,
      lost: cur.lost + s.lost,
      drawn: cur.drawn + s.drawn,
    };
  }
  return out;
}

export async function mergeAccounts(
  anonId: string,
  targetId: string,
): Promise<void> {
  if (anonId === targetId) return;
  await db.transaction(async (tx) => {
    const [anonProfile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, anonId))
      .limit(1);
    const [targetProfile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, targetId))
      .limit(1);
    if (anonProfile && targetProfile) {
      const merged = mergeStats(
        targetProfile.stats ?? {},
        anonProfile.stats ?? {},
      );
      await tx
        .update(userProfile)
        .set({ stats: merged, updatedAt: new Date() })
        .where(eq(userProfile.userId, targetId));
    }

    await tx
      .update(game)
      .set({ creatorUserId: targetId })
      .where(eq(game.creatorUserId, anonId));
    await tx
      .update(game)
      .set({ challengedUserId: targetId })
      .where(eq(game.challengedUserId, anonId));
    await tx
      .update(game)
      .set({ winner: targetId })
      .where(eq(game.winner, anonId));

    const targetSeatGames = await tx
      .select({ gameId: gamePlayer.gameId })
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, targetId));
    const targetSeatSet = new Set(targetSeatGames.map((r) => r.gameId));
    const anonSeats = await tx
      .select()
      .from(gamePlayer)
      .where(eq(gamePlayer.userId, anonId));
    for (const seat of anonSeats) {
      if (targetSeatSet.has(seat.gameId)) {
        await tx.delete(gamePlayer).where(eq(gamePlayer.id, seat.id));
      } else {
        await tx
          .update(gamePlayer)
          .set({ userId: targetId })
          .where(eq(gamePlayer.id, seat.id));
        targetSeatSet.add(seat.gameId);
      }
    }
    await tx
      .update(move)
      .set({ playerId: targetId })
      .where(eq(move.playerId, anonId));

    const anonFriendships = await tx
      .select()
      .from(friendship)
      .where(
        or(
          eq(friendship.requesterId, anonId),
          eq(friendship.addresseeId, anonId),
        ),
      );
    for (const f of anonFriendships) {
      const other = f.requesterId === anonId ? f.addresseeId : f.requesterId;
      if (other === targetId) {
        await tx.delete(friendship).where(eq(friendship.id, f.id));
        continue;
      }
      const [existing] = await tx
        .select()
        .from(friendship)
        .where(eq(friendship.pairKey, pairKeyOf(targetId, other)))
        .limit(1);
      if (existing) {
        const keep = betterFriendStatus(existing.status, f.status);
        await tx
          .update(friendship)
          .set({ status: keep, updatedAt: new Date() })
          .where(eq(friendship.id, existing.id));
        await tx.delete(friendship).where(eq(friendship.id, f.id));
      } else {
        const requesterId = f.requesterId === anonId ? targetId : f.requesterId;
        const addresseeId = f.addresseeId === anonId ? targetId : f.addresseeId;
        await tx
          .update(friendship)
          .set({
            requesterId,
            addresseeId,
            pairKey: pairKeyOf(requesterId, addresseeId),
            updatedAt: new Date(),
          })
          .where(eq(friendship.id, f.id));
      }
    }

    const anonMemberships = await tx
      .select()
      .from(conversationMember)
      .where(eq(conversationMember.userId, anonId));
    for (const m of anonMemberships) {
      const [conv] = await tx
        .select()
        .from(conversation)
        .where(eq(conversation.id, m.conversationId))
        .limit(1);
      const isSelfDm =
        conv?.kind === "dm" && conv.dmKey === pairKeyOf(anonId, targetId);
      const [targetMember] = await tx
        .select({ id: conversationMember.id })
        .from(conversationMember)
        .where(
          and(
            eq(conversationMember.conversationId, m.conversationId),
            eq(conversationMember.userId, targetId),
          ),
        )
        .limit(1);
      if (isSelfDm || targetMember) {
        await tx
          .delete(conversationMember)
          .where(eq(conversationMember.id, m.id));
      } else {
        await tx
          .update(conversationMember)
          .set({ userId: targetId })
          .where(eq(conversationMember.id, m.id));
      }
    }

    await tx
      .update(message)
      .set({ senderId: targetId })
      .where(eq(message.senderId, anonId));

    await tx
      .update(notification)
      .set({ userId: targetId })
      .where(eq(notification.userId, anonId));
    await tx
      .update(notification)
      .set({ actorId: targetId })
      .where(eq(notification.actorId, anonId));
    await tx
      .delete(notification)
      .where(sql`${notification.actorId} = ${notification.userId}`);

    await tx.delete(userProfile).where(eq(userProfile.userId, anonId));
    await tx.delete(user).where(eq(user.id, anonId));
  });
}
