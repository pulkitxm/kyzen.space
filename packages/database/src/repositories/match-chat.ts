import { ANON_MAX_FRIENDS } from "@kyzen/shared/constants";
import type { MatchMessage } from "@kyzen/shared/types";
import { and, count, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
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

async function participant(tx: Transaction, code: string, userId: string) {
  const [row] = await tx
    .select()
    .from(game)
    .where(and(eq(game.code, code), eq(game.publicMatch, true)))
    .for("update");
  if (!row) throw new Error("Match not found");
  const players = await tx
    .select()
    .from(gamePlayer)
    .where(eq(gamePlayer.gameId, row.id))
    .orderBy(gamePlayer.seatOrder);
  if (!players.some((player) => player.userId === userId))
    throw new Error("Match not found");
  return { row, players };
}

export async function readMatchChat(code: string, userId: string) {
  return db.transaction(async (tx) => {
    const { row, players } = await participant(tx, code, userId);
    const choices = await tx
      .select()
      .from(matchFriendChoice)
      .where(eq(matchFriendChoice.gameId, row.id));
    const rows =
      row.status === "active"
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
    const peers: { playerId: string; username: string }[] = [];
    const chosen = choices.some((choice) => choice.userId === userId);
    if (chosen) {
      for (const peer of players.filter((player) => player.userId !== userId)) {
        if (!choices.some((choice) => choice.userId === peer.userId)) continue;
        const [connection] = await tx
          .select()
          .from(friendship)
          .where(eq(friendship.pairKey, pairKey(userId, peer.userId)));
        if (connection?.status !== "accepted") continue;
        const [profile] = await tx
          .select({ username: userProfile.username })
          .from(userProfile)
          .where(eq(userProfile.userId, peer.userId));
        if (profile)
          peers.push({
            playerId: `${code}:${peer.role}`,
            username: profile.username,
          });
      }
    }
    return {
      chosen,
      mutual: peers.length > 0,
      peerUsername: peers[0]?.username ?? null,
      peers,
      messages: rows.reverse().map(
        (message): MatchMessage => ({
          id: message.id,
          gameId: code,
          authorId: `${code}:${players.find((player) => player.userId === message.senderId)?.role}`,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
        }),
      ),
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
    if (row.status !== "active") throw new Error("Match chat has ended");
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
    return {
      id: message.id,
      gameId: input.code,
      authorId: `${input.code}:${players.find((player) => player.userId === input.userId)?.role}`,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
  });
}

async function connectPair(tx: Transaction, userIds: string[]) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${pairKey(userIds[0] ?? "", userIds[1] ?? "")}))`,
  );
  const key = pairKey(userIds[0] ?? "", userIds[1] ?? "");
  const [existing] = await tx
    .select()
    .from(friendship)
    .where(eq(friendship.pairKey, key));
  if (existing?.status !== "accepted") {
    for (const id of [...userIds].sort()) {
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
        requesterId: userIds[0] ?? "",
        addresseeId: userIds[1] ?? "",
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
}

export async function chooseMatchFriend(code: string, userId: string) {
  return db.transaction(async (tx) => {
    const { row, players } = await participant(tx, code, userId);
    if (
      row.status !== "active" &&
      (!row.completedAt || Date.now() - row.completedAt.getTime() > 15 * 60000)
    )
      throw new Error("The connection window has ended");
    await tx
      .insert(matchFriendChoice)
      .values({ gameId: row.id, userId })
      .onConflictDoNothing();
    const choices = await tx
      .select()
      .from(matchFriendChoice)
      .where(eq(matchFriendChoice.gameId, row.id));
    const connections: string[][] = [];
    for (const peer of players
      .filter((player) => player.userId !== userId)
      .sort((a, b) => a.userId.localeCompare(b.userId))) {
      if (!choices.some((choice) => choice.userId === peer.userId)) continue;
      const pair = [userId, peer.userId].sort();
      await connectPair(tx, pair);
      connections.push(pair);
    }
    return {
      mutual: connections.length > 0,
      userIds: players.map((player) => player.userId),
      connections,
    };
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
