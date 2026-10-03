import { afterAll, describe, expect, it } from "bun:test";
import { games } from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameRecord } from "@kyzen/shared/types";
import { createHarness, DB_UP, type TestUser } from "./harness";

const h = createHarness("gre");

afterAll(h.cleanup);

const emptyState = { board: Array(9).fill(null), turn: "X" as const };

async function createSoloGame(
  creator: TestUser,
  overrides: Partial<Parameters<typeof games.createGame>[0]> = {},
): Promise<GameRecord> {
  const record = await games.createGame({
    gameType: TIC_TAC_TOE,
    players: [{ userId: creator.id, username: creator.username, role: "X" }],
    gameState: emptyState,
    creatorUserId: creator.id,
    seatingMode: "open",
    ...overrides,
  });
  h.trackGame(record.id);
  return record;
}

describe.skipIf(!DB_UP)("game_player and move constraints", () => {
  it("a duplicate move number raises the move_game_number_uq backstop", async () => {
    const a = await h.makeUser("mvA");
    const record = await createSoloGame(a);

    await games.addMove({
      gameId: record.id,
      moveNumber: 1,
      playerId: a.id,
      moveData: { row: 0, col: 0 },
    });

    let threw = false;
    try {
      await games.addMove({
        gameId: record.id,
        moveNumber: 1,
        playerId: a.id,
        moveData: { row: 1, col: 1 },
      });
    } catch (error) {
      threw = true;
      const e = error as { code?: string; cause?: { code?: string } };
      expect(e.code ?? e.cause?.code).toBe("23505");
    }
    expect(threw).toBe(true);

    const moves = await games.listMoves(record.id);
    expect(moves).toHaveLength(1);
  });

  it("nextMoveNumber returns 1 on an empty game and advances by one per move", async () => {
    const a = await h.makeUser("nmA");
    const record = await createSoloGame(a);

    expect(await games.nextMoveNumber(record.id)).toBe(1);
    await games.addMove({
      gameId: record.id,
      moveNumber: 1,
      playerId: a.id,
      moveData: { row: 0, col: 0 },
    });
    expect(await games.nextMoveNumber(record.id)).toBe(2);
  });

  it("seatPlayer is rejected idempotently for a duplicate seat and never violates game_player_uq", async () => {
    const a = await h.makeUser("spA");
    const b = await h.makeUser("spB");
    const record = await createSoloGame(a);
    const seat = { userId: b.id, username: b.username, role: "O" };

    const first = await games.seatPlayer(record.id, seat, 1);
    const dupSameOrder = await games.seatPlayer(record.id, seat, 1);
    const dupOtherOrder = await games.seatPlayer(record.id, seat, 5);

    expect(first).toBe(true);
    expect(dupSameOrder).toBe(false);
    expect(dupOtherOrder).toBe(false);

    const players = await games.getPlayers(record.id);
    expect(players.filter((p) => p.userId === b.id)).toHaveLength(1);
  });

  it("getPlayers orders seats by seatOrder regardless of insertion order", async () => {
    const a = await h.makeUser("soA");
    const b = await h.makeUser("soB");
    const record = await createSoloGame(a);

    await games.seatPlayer(
      record.id,
      { userId: b.id, username: b.username, role: "O" },
      5,
    );

    const players = await games.getPlayers(record.id);
    expect(players.map((p) => p.role)).toEqual(["X", "O"]);
    expect(players.map((p) => p.userId)).toEqual([a.id, b.id]);
  });
});

describe.skipIf(!DB_UP)(
  "createGame seriesId self-default and series reads",
  () => {
    it("a fresh game defaults seriesId to its own row id and is the sole member of its series", async () => {
      const a = await h.makeUser("seA");
      const record = await createSoloGame(a);

      expect(record.seriesId).toBe(record.id);

      const series = await games.getSeriesGames(record.id);
      expect(series.map((g) => g.id)).toEqual([record.id]);
      expect(series[0]?.players).toHaveLength(1);
    });

    it("getSeriesGames returns every game sharing a seriesId in createdAt order", async () => {
      const a = await h.makeUser("sgA");
      const root = await createSoloGame(a);
      const child = await createSoloGame(a, { seriesId: root.id });

      const series = await games.getSeriesGames(root.id);
      expect(series.map((g) => g.id)).toEqual([root.id, child.id]);
      expect(series.every((g) => g.seriesId === root.id)).toBe(true);
    });
  },
);

describe.skipIf(!DB_UP)("findLiveGameInConversation status filter", () => {
  it("returns the most-recent waiting/active game and null once all are terminal", async () => {
    const a = await h.makeUser("flA");
    const b = await h.makeUser("flB");
    const convId = await h.makeDm(a, b);

    const first = await createSoloGame(a, {
      conversationId: convId,
      status: "active",
    });
    const live = await games.findLiveGameInConversation(convId, TIC_TAC_TOE);
    expect(live?.id).toBe(first.id);

    await games.updateGame(first.id, { status: "completed" });
    expect(
      await games.findLiveGameInConversation(convId, TIC_TAC_TOE),
    ).toBeNull();

    const second = await createSoloGame(a, {
      conversationId: convId,
      status: "waiting",
    });
    const liveAgain = await games.findLiveGameInConversation(
      convId,
      TIC_TAC_TOE,
    );
    expect(liveAgain?.id).toBe(second.id);
  });

  it("ignores an abandoned game when resolving the live game", async () => {
    const a = await h.makeUser("abA");
    const b = await h.makeUser("abB");
    const convId = await h.makeDm(a, b);

    const abandoned = await createSoloGame(a, {
      conversationId: convId,
      status: "active",
    });
    await games.updateGame(abandoned.id, { status: "abandoned" });

    expect(
      await games.findLiveGameInConversation(convId, TIC_TAC_TOE),
    ).toBeNull();
  });
});

describe.skipIf(!DB_UP)(
  "batched moves, lobby removal, and rematch rooms",
  () => {
    it("persistGameMoves writes a batch with consecutive numbers under one state check", async () => {
      const a = await h.makeUser("batchA");
      const record = await createSoloGame(a, { status: "active" });
      const next = {
        board: ["X", "O", null, null, null, null, null, null, null],
      };
      const saved = await games.persistGameMoves({
        previous: record,
        moves: [
          { playerId: a.id, moveData: { row: 0, col: 0 } },
          { playerId: "bot:1", moveData: { row: 0, col: 1 } },
        ],
        gameState: next,
        outcome: { status: "active" },
      });
      expect(saved?.moves.map((row) => [row.moveNumber, row.playerId])).toEqual(
        [
          [1, a.id],
          [2, "bot:1"],
        ],
      );
      expect(saved?.game.gameState).toEqual(next);

      const stale = await games.persistGameMoves({
        previous: record,
        moves: [{ playerId: a.id, moveData: { row: 2, col: 2 } }],
        gameState: emptyState,
        outcome: { status: "active" },
      });
      expect(stale).toBeNull();
      expect(
        (await games.listMoves(record.id)).map((row) => row.moveNumber),
      ).toEqual([1, 2]);
      expect((await games.getGameById(record.id))?.gameState).toEqual(next);
    });

    it("removeLobbyPlayer compacts seats, renumbers roles, and drops the team entry", async () => {
      const [a, b, c] = await Promise.all(
        ["rmA", "rmB", "rmC"].map((label) => h.makeUser(label)),
      );
      if (!a || !b || !c) throw new Error("users missing");
      const record = await games.createGame({
        gameType: TIC_TAC_TOE,
        status: "waiting",
        players: [a, b, c].map((user, index) => ({
          userId: user.id,
          username: user.username,
          role: `P${index + 1}`,
        })),
        gameState: null,
        config: {
          mode: "teams",
          teams: { [a.id]: "A", [b.id]: "B" },
          bots: [],
        },
        creatorUserId: a.id,
        seatingMode: "open",
      });
      h.trackGame(record.id);
      const roleForSeat = (index: number) => `P${index + 1}`;
      const updated = await games.removeLobbyPlayer({
        gameId: record.id,
        userId: b.id,
        roleForSeat,
      });
      expect(updated?.players.map((p) => [p.userId, p.role])).toEqual([
        [a.id, "P1"],
        [c.id, "P2"],
      ]);
      expect(updated?.config).toEqual({
        mode: "teams",
        teams: { [a.id]: "A" },
        bots: [],
      });
      expect(
        await games.removeLobbyPlayer({
          gameId: record.id,
          userId: b.id,
          roleForSeat,
        }),
      ).toBeNull();
      const d = await h.makeUser("rmD");
      expect(
        await games.seatPlayer(
          record.id,
          { userId: d.id, username: d.username, role: "P3" },
          2,
        ),
      ).toBe(true);
      expect(
        (await games.getPlayers(record.id)).map((p) => [p.userId, p.role]),
      ).toEqual([
        [a.id, "P1"],
        [c.id, "P2"],
        [d.id, "P3"],
      ]);
    });

    it("createRematch opens one live room per series even under concurrent clicks", async () => {
      const [a, b] = await Promise.all(
        ["crA", "crB"].map((label) => h.makeUser(label)),
      );
      if (!a || !b) throw new Error("users missing");
      const finished = await createSoloGame(a, { status: "completed" });
      const open = (user: TestUser) =>
        games.createRematch({
          gameType: TIC_TAC_TOE,
          status: "waiting",
          players: [{ userId: user.id, username: user.username, role: "X" }],
          gameState: null,
          creatorUserId: user.id,
          seatingMode: "open",
          seriesId: finished.seriesId ?? finished.id,
        });
      const results = await Promise.all([open(a), open(b), open(a)]);
      for (const result of results) h.trackGame(result.game.id);
      expect(results.filter((result) => result.created)).toHaveLength(1);
      expect(new Set(results.map((result) => result.game.code)).size).toBe(1);
      const series = await games.getSeriesGames(finished.seriesId ?? "");
      expect(series.map((row) => row.status)).toEqual(["completed", "waiting"]);
    });
  },
);
