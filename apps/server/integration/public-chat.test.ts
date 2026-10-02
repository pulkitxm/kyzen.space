import { afterAll, describe, expect, it } from "bun:test";
import {
  conversations,
  db,
  friends,
  games,
  matchChat,
  profiles,
  schema,
} from "@kyzen/database";
import { getDefinition } from "@kyzen/games-core";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { eq } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import { serializeGame, serializeMove } from "../src/api/serialize";
import { createDm } from "../src/chat/conversations-service";
import { handleMakeMove } from "../src/realtime/turn-based";
import { createHarness, DB_UP } from "./harness";

const h = createHarness("matchchat");
afterAll(() => h.cleanup());
async function fixture() {
  const a = await h.makeUser("a");
  const b = await h.makeUser("b");
  const game = await games.createGame({
    publicMatch: true,
    gameType: TIC_TAC_TOE,
    status: "active",
    players: [
      { userId: a.id, username: a.username, role: "X" },
      { userId: b.id, username: b.username, role: "O" },
    ],
    gameState: getDefinition(TIC_TAC_TOE).engine.createInitialState([
      { role: "X" },
      { role: "O" },
    ]),
  });
  h.trackGame(game.id);
  return { a, b, game };
}

describe.skipIf(!DB_UP)("anonymous public match privacy", () => {
  it("redacts identities from snapshots, winners, and moves", async () => {
    const { a, b, game } = await fixture();
    const snapshot = serializeGame({ ...game, winner: a.id }, a.id);
    const move = serializeMove(
      await games.addMove({
        gameId: game.id,
        playerId: b.id,
        moveNumber: 1,
        moveData: { row: 0, col: 0 },
      }),
      game.code,
      game,
    );
    const wire = JSON.stringify({ snapshot, move });
    for (const secret of [a.id, b.id, a.username, b.username])
      expect(wire).not.toContain(secret);
    expect(snapshot.viewerId).toBe(`${game.code}:X`);
    expect(snapshot.winner).toBe(`${game.code}:X`);
    expect(move.playerId).toBe(`${game.code}:O`);
  });
  it("gates participants, deduplicates retries, and limits bursts", async () => {
    const { a, game } = await fixture();
    const outsider = await h.makeUser("outsider");
    const input = {
      code: game.code,
      userId: a.id,
      body: "hello from a synthetic player",
      clientId: crypto.randomUUID(),
    };
    const sent = await matchChat.sendMatchMessage(input);
    expect(await matchChat.sendMatchMessage(input)).toEqual(sent);
    expect(
      (await matchChat.readMatchChat(game.code, a.id)).messages,
    ).toHaveLength(1);
    expect(sent.authorId).toBe(`${game.code}:X`);
    await expect(
      matchChat.readMatchChat(game.code, outsider.id),
    ).rejects.toThrow("Match not found");
    await expect(
      matchChat.sendMatchMessage({ ...input, userId: outsider.id }),
    ).rejects.toThrow("Match not found");
    await expect(
      matchChat.sendMatchMessage({ ...input, clientId: crypto.randomUUID() }),
    ).rejects.toThrow("Please wait");
  });
  it("hides ended chat, retains safety data, and deletes expired rows", async () => {
    const { a, game } = await fixture();
    const input = {
      code: game.code,
      userId: a.id,
      body: "synthetic safety record",
      clientId: crypto.randomUUID(),
    };
    const sent = await matchChat.sendMatchMessage(input);
    await games.updateGame(game.id, {
      status: "completed",
      completedAt: new Date(),
    });
    expect((await matchChat.readMatchChat(game.code, a.id)).messages).toEqual(
      [],
    );
    expect(
      await db
        .select()
        .from(schema.matchMessage)
        .where(eq(schema.matchMessage.id, sent.id)),
    ).toHaveLength(1);
    await expect(matchChat.sendMatchMessage(input)).rejects.toThrow(
      "Match chat has ended",
    );
    await db
      .update(schema.matchMessage)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.matchMessage.id, sent.id));
    await matchChat.purgeExpiredMatchData();
    expect(
      await db
        .select()
        .from(schema.matchMessage)
        .where(eq(schema.matchMessage.id, sent.id)),
    ).toHaveLength(0);
  });
  it("requires mutual consent before creating friendship and a fresh DM", async () => {
    const { a, b, game } = await fixture();
    await matchChat.sendMatchMessage({
      code: game.code,
      userId: a.id,
      body: "this stays in the match",
      clientId: crypto.randomUUID(),
    });
    expect((await matchChat.chooseMatchFriend(game.code, a.id)).mutual).toBe(
      false,
    );
    expect(await friends.areFriends(a.id, b.id)).toBe(false);
    expect(await conversations.findDm(a.id, b.id)).toBeNull();
    expect((await createDm(a.id, b.id)).ok).toBe(false);
    const results = await Promise.all([
      matchChat.chooseMatchFriend(game.code, b.id),
      matchChat.chooseMatchFriend(game.code, b.id),
    ]);
    expect(results.every((result) => result.mutual)).toBe(true);
    expect(await friends.areFriends(a.id, b.id)).toBe(true);
    expect((await createDm(a.id, b.id)).ok).toBe(true);
    const dm = await conversations.findDm(a.id, b.id);
    if (dm)
      await db
        .delete(schema.conversation)
        .where(eq(schema.conversation.id, dm.id));
  });
  it("ignores a stale timeout after a player has moved", async () => {
    const { a, b, game } = await fixture();
    const definition = getDefinition(TIC_TAC_TOE);
    const result = definition.engine.reduce?.(
      game.gameState,
      { role: "X" },
      { row: 0, col: 0 },
    );
    if (!result?.ok) throw new Error("Synthetic move failed");
    await games.persistGameMove({
      previous: game,
      playerId: a.id,
      moveData: { row: 0, col: 0 },
      gameState: result.state,
      outcome: result.outcome,
    });
    expect(await games.abortActiveGame(game, b.id)).toBeNull();
    expect((await games.getGameById(game.id))?.status).toBe("active");
    expect(
      (await profiles.getProfileByUserId(b.id))?.stats[TIC_TAC_TOE],
    ).toBeUndefined();
  });
  it("serializes concurrent moves and completion with exactly one stats update", async () => {
    const { a, b, game } = await fixture();
    const wire: unknown[] = [];
    const io = {
      to: () => ({
        emit: (_event: string, payload: unknown) => wire.push(payload),
      }),
    } as unknown as Server;
    const socket = (userId: string) =>
      ({
        data: { userId },
        emit: (_event: string, payload: unknown) => wire.push(payload),
      }) as unknown as Socket;
    const make = (userId: string, row: number, col: number) =>
      handleMakeMove(io, socket(userId), {
        gameId: game.code,
        moveData: { row, col },
      });
    await Promise.all(Array.from({ length: 10 }, () => make(a.id, 0, 0)));
    expect(await games.listMoves(game.id)).toHaveLength(1);
    await make(b.id, 1, 0);
    await make(a.id, 0, 1);
    await make(b.id, 1, 1);
    await Promise.all(Array.from({ length: 10 }, () => make(a.id, 0, 2)));
    expect(await games.listMoves(game.id)).toHaveLength(5);
    expect((await games.getGameById(game.id))?.status).toBe("completed");
    expect(
      (await profiles.getProfileByUserId(a.id))?.stats[TIC_TAC_TOE]?.won,
    ).toBe(1);
    expect(
      (await profiles.getProfileByUserId(b.id))?.stats[TIC_TAC_TOE]?.lost,
    ).toBe(1);
    for (const secret of [a.id, b.id, a.username, b.username])
      expect(JSON.stringify(wire)).not.toContain(secret);
  });
});
