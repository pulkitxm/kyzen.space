import { ANON_MAX_FRIENDS } from "@kyzen/shared/constants";
import { isBotId, isGameLive, type MatchMessage } from "@kyzen/shared/types";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "../client";
import {
  friendship,
  game,
  gamePlayer,
  matchFriendChoice,
  matchMessage,
  matchmakingTicket,
  user,
  userProfile,
} from "../schema";
import { pairKey } from "./friends";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MatchRow = typeof game.$inferSelect;
type Seat = { userId: string; role: string };

const FRIEND_WINDOW_MS = 15 * 60000;

async function participant(tx: Transaction, code: string, userId: string) {
  const [row] = await tx
    .select()
    .from(game)
    .where(and(eq(game.code, code), isNull(game.conversationId)))
    .for("update");
  if (!row) throw new Error("Match not found");
  const players = await tx
    .select({ userId: gamePlayer.userId, role: gamePlayer.role })
    .from(gamePlayer)
    .where(eq(gamePlayer.gameId, row.id))
    .orderBy(gamePlayer.seatOrder);
  if (!players.some((player) => player.userId === userId))
    throw new Error("Match not found");
  return { row, players };
}

function playerIdOf(row: MatchRow, players: Seat[], userId: string): string {
  if (!row.publicMatch) return userId;
  const seat = players.find((player) => player.userId === userId);
  return seat ? `${row.code}:${seat.role}` : "";
}

function toMatchMessage(
  row: MatchRow,
  players: Seat[],
  message: typeof matchMessage.$inferSelect,
): MatchMessage {
  return {
    id: message.id,
    gameId: row.code,
    authorId: playerIdOf(row, players, message.senderId),
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function readMatchChat(code: string, userId: string) {
  return db.transaction(async (tx) => {
    const { row, players } = await participant(tx, code, userId);
    const choices = await tx
      .select()
      .from(matchFriendChoice)
      .where(eq(matchFriendChoice.gameId, row.id));
    const rows = isGameLive(row.status)
      ? await tx
          .select()
          .from(matchMessage)
          .where(
            and(
              eq(matchMessage.gameId, row.id),
              gt(matchMessage.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(matchMessage.createdAt), desc(matchMessage.id))
          .limit(100)
      : [];
    const chosen = choices
      .filter((choice) => choice.userId === userId)
      .map((choice) => choice.targetUserId);
    const mutualIds = chosen.filter((target) =>
      choices.some(
        (choice) => choice.userId === target && choice.targetUserId === userId,
      ),
    );
    const accepted = mutualIds.length
      ? await tx
          .select({ pairKey: friendship.pairKey })
          .from(friendship)
          .where(
            and(
              inArray(
                friendship.pairKey,
                mutualIds.map((target) => pairKey(userId, target)),
              ),
              eq(friendship.status, "accepted"),
            ),
          )
      : [];
    const friendIds = mutualIds.filter((target) =>
      accepted.some((row) => row.pairKey === pairKey(userId, target)),
    );
    const profiles = friendIds.length
      ? await tx
          .select({
            userId: userProfile.userId,
            username: userProfile.username,
          })
          .from(userProfile)
          .where(inArray(userProfile.userId, friendIds))
      : [];
    return {
      choices: chosen.map((target) => playerIdOf(row, players, target)),
      friends: profiles.map((profile) => ({
        playerId: playerIdOf(row, players, profile.userId),
        username: profile.username,
      })),
      messages: rows
        .reverse()
        .map((message) => toMatchMessage(row, players, message)),
    };
  });
}

export async function sendMatchMessage(input: {
  code: string;
  userId: string;
  body: string;
  clientId: string;
}): Promise<MatchMessage> {
  return db.transaction(async (tx) => {
    const { row, players } = await participant(tx, input.code, input.userId);
    if (!isGameLive(row.status)) throw new Error("Match chat has ended");
    const [existing] = await tx
      .select()
      .from(matchMessage)
      .where(
        and(
          eq(matchMessage.gameId, row.id),
          eq(matchMessage.senderId, input.userId),
          eq(matchMessage.clientId, input.clientId),
        ),
      );
    let message = existing;
    if (!message) {
      const [last] = await tx
        .select()
        .from(matchMessage)
        .where(
          and(
            eq(matchMessage.gameId, row.id),
            eq(matchMessage.senderId, input.userId),
          ),
        )
        .orderBy(desc(matchMessage.createdAt))
        .limit(1);
      if (last && Date.now() - last.createdAt.getTime() < 1000)
        throw new Error("Please wait before sending another message");
      const [total] = await tx
        .select({ value: count() })
        .from(matchMessage)
        .where(eq(matchMessage.gameId, row.id));
      if ((total?.value ?? 0) >= 500)
        throw new Error("Match chat limit reached");
      [message] = await tx
        .insert(matchMessage)
        .values({
          gameId: row.id,
          senderId: input.userId,
          clientId: input.clientId,
          body: input.body,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        })
        .returning();
    }
    if (!message) throw new Error("Message could not be saved");
    return toMatchMessage(row, players, message);
  });
}

export async function chooseMatchFriend(
  code: string,
  userId: string,
  playerId: string,
): Promise<{ mutual: boolean; targetUserId: string }> {
  return db.transaction(async (tx) => {
    const { row, players } = await participant(tx, code, userId);
    if (!row.publicMatch) throw new Error("Match not found");
    if (
      row.status !== "active" &&
      (!row.completedAt ||
        Date.now() - row.completedAt.getTime() > FRIEND_WINDOW_MS)
    )
      throw new Error("The connection window has ended");
    const target = players.find(
      (player) => playerIdOf(row, players, player.userId) === playerId,
    );
    if (!target || target.userId === userId || isBotId(target.userId))
      throw new Error("Player not found");
    const targetUserId = target.userId;
    const key = pairKey(userId, targetUserId);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    await tx
      .insert(matchFriendChoice)
      .values({ gameId: row.id, userId, targetUserId })
      .onConflictDoNothing();
    const [reverse] = await tx
      .select()
      .from(matchFriendChoice)
      .where(
        and(
          eq(matchFriendChoice.gameId, row.id),
          eq(matchFriendChoice.userId, targetUserId),
          eq(matchFriendChoice.targetUserId, userId),
        ),
      );
    if (!reverse) return { mutual: false, targetUserId };
    const pair = [userId, targetUserId].sort();
    const [existing] = await tx
      .select()
      .from(friendship)
      .where(eq(friendship.pairKey, key));
    if (existing?.status !== "accepted") {
      for (const id of pair) {
        const [account] = await tx
          .select()
          .from(user)
          .where(eq(user.id, id))
          .for("update");
        const [total] = await tx
          .select({ value: count() })
          .from(friendship)
          .where(
            or(
              and(
                eq(friendship.requesterId, id),
                inArray(friendship.status, ["pending", "accepted"]),
              ),
              and(
                eq(friendship.addresseeId, id),
                eq(friendship.status, "accepted"),
              ),
            ),
          );
        if (account?.isAnonymous && (total?.value ?? 0) >= ANON_MAX_FRIENDS)
          throw new Error("Guest friend limit reached");
      }
      await tx
        .insert(friendship)
        .values({
          requesterId: pair[0] ?? "",
          addresseeId: pair[1] ?? "",
          pairKey: key,
          status: "accepted",
          respondedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: friendship.pairKey,
          set: {
            status: "accepted",
            respondedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }
    return { mutual: true, targetUserId };
  });
}

export async function purgeExpiredMatchData(): Promise<void> {
  await db.delete(matchMessage).where(lt(matchMessage.expiresAt, new Date()));
  await db
    .delete(matchmakingTicket)
    .where(lt(matchmakingTicket.expiresAt, new Date()));
  await db
    .delete(matchFriendChoice)
    .where(
      lt(matchFriendChoice.createdAt, new Date(Date.now() - 7 * 86400000)),
    );
}
