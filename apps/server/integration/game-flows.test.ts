import { afterAll, describe, expect, it } from "bun:test";
import { type TicTacToeState, ticTacToeEngine } from "@gamelobby/games-core";
import { eq, sql } from "drizzle-orm";
import * as conversationsService from "../src/chat/conversations-service";
import * as friendsService from "../src/chat/friends-service";
import { createGameInConversation } from "../src/chat/games-in-chat-service";
import type { ServiceResult } from "../src/chat/result";
import { db, friends, games, schema } from "../src/db";

let DB_UP = false;
try {
  await db.execute(sql`select 1`);
  DB_UP = true;
} catch {
  DB_UP = false;
}

const createdUserIds: string[] = [];
const createdConvIds: string[] = [];

type TestUser = { id: string; username: string };

async function makeUser(label: string): Promise<TestUser> {
  const id = `gtest_${label}_${crypto.randomUUID()}`;
  const username = `gtest_${label}_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .insert(schema.user)
    .values({ id, name: label, email: `${id}@gtest.local` });
  await db.insert(schema.userProfile).values({ userId: id, username });
  createdUserIds.push(id);
  return { id, username };
}

function unwrap<T>(res: ServiceResult<T>): T {
  if (!res.ok) throw new Error(`expected ok, got error: ${res.error}`);
  return res.value;
}

async function befriend(a: TestUser, b: TestUser): Promise<void> {
  await friendsService.sendFriendRequest(a.id, b.username);
  const row = await friends.getFriendshipBetween(a.id, b.id);
  await friendsService.respondToRequest(b.id, row?.id ?? "", "accept");
}

async function dmBetween(a: TestUser, b: TestUser): Promise<string> {
  await befriend(a, b);
  const conv = unwrap(await conversationsService.createDm(a.id, b.id));
  createdConvIds.push(conv.id);
  return conv.id;
}

afterAll(async () => {
  if (!DB_UP) return;
  for (const id of createdConvIds) {
    await db
      .delete(schema.conversation)
      .where(eq(schema.conversation.id, id))
      .catch(() => {});
  }
  for (const id of createdUserIds) {
    await db
      .delete(schema.user)
      .where(eq(schema.user.id, id))
      .catch(() => {});
  }
});

describe.skipIf(!DB_UP)("game flows — normalized game_player", () => {
  it("creates a game in a DM, seats the creator, posts a card", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    const convId = await dmBetween(a, b);

    const { game, message } = unwrap(
      await createGameInConversation({
        userId: a.id,
        conversationId: convId,
        gameType: "tic-tac-toe",
      }),
    );

    expect(game.players).toEqual([
      { userId: a.id, username: a.username, role: "X" },
    ]);
    expect(message.kind).toBe("game_card");

    const loaded = await games.getGameById(game.id);
    expect(loaded?.players).toHaveLength(1);
    expect(loaded?.players[0]?.userId).toBe(a.id);
  });

  it("seats a second player and lists the game for both via the indexed join", async () => {
    const a = await makeUser("c");
    const b = await makeUser("d");
    const convId = await dmBetween(a, b);
    const { game } = unwrap(
      await createGameInConversation({
        userId: a.id,
        conversationId: convId,
        gameType: "tic-tac-toe",
      }),
    );

    await games.seatPlayer(
      game.id,
      { userId: b.id, username: b.username, role: "O" },
      1,
    );
    await games.updateGame(game.id, { status: "active" });

    const loaded = await games.getGameById(game.id);
    expect(loaded?.players.map((p) => p.role)).toEqual(["X", "O"]);

    const aGames = await games.gamesForUser(a.id);
    const bGames = await games.gamesForUser(b.id);
    expect(aGames.some((g) => g.id === game.id)).toBe(true);
    expect(bGames.some((g) => g.id === game.id)).toBe(true);
  });

  it("persists moves and completes a game with a winner", async () => {
    const a = await makeUser("e");
    const b = await makeUser("f");
    const convId = await dmBetween(a, b);
    const { game } = unwrap(
      await createGameInConversation({
        userId: a.id,
        conversationId: convId,
        gameType: "tic-tac-toe",
      }),
    );
    await games.seatPlayer(
      game.id,
      { userId: b.id, username: b.username, role: "O" },
      1,
    );
    await games.updateGame(game.id, { status: "active" });

    const seq: [string, "X" | "O", number, number][] = [
      [a.id, "X", 0, 0],
      [b.id, "O", 1, 0],
      [a.id, "X", 0, 1],
      [b.id, "O", 1, 1],
      [a.id, "X", 0, 2],
    ];

    let state = (await games.getGameById(game.id))?.gameState as TicTacToeState;
    for (const [uid, role, row, col] of seq) {
      const res = ticTacToeEngine.reduce!(state, { role }, { row, col });
      if (!res.ok) throw new Error(res.error);
      state = res.state;
      const moveNumber = await games.nextMoveNumber(game.id);
      await games.addMove({
        gameId: game.id,
        moveNumber,
        playerId: uid,
        moveData: { row, col },
      });
      await games.updateGame(game.id, {
        gameState: state,
        ...(res.outcome.status === "completed"
          ? {
              status: "completed",
              winner: res.outcome.draw ? "draw" : a.id,
              completedAt: new Date(),
            }
          : {}),
      });
    }

    const loaded = await games.getGameById(game.id);
    expect(loaded?.status).toBe("completed");
    expect(loaded?.winner).toBe(a.id);
    const moves = await games.listMoves(game.id);
    expect(moves).toHaveLength(5);
  });
});
