import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameRecord, Outcome } from "@kyzen/shared/types";

const UUID = "11111111-1111-1111-1111-111111111111";
const CODE = "K7P2QX";

type Player = { userId: string; username: string; role: string };
// biome-ignore lint/suspicious/noExplicitAny: test game record
let current: any;
// biome-ignore lint/suspicious/noExplicitAny: test move store
let moves: any[] = [];
const bumpCalls: { userId: string; outcome: string }[] = [];

const games = {
  abortActiveGame: async (_previous: GameRecord, winners: string[]) => {
    current = {
      ...current,
      status: "aborted",
      winner: winners.length === 1 ? winners[0] : null,
      winners,
      completedAt: new Date(),
    };
    if (winners.length)
      for (const player of current.players)
        bumpCalls.push({
          userId: player.userId,
          outcome: winners.includes(player.userId) ? "won" : "lost",
        });
    return current;
  },
  persistGameMove: async (input: {
    previous: GameRecord;
    playerId: string;
    moveData: unknown;
    gameState: unknown;
    outcome: Outcome;
  }) => {
    const row = {
      id: `m${moves.length + 1}`,
      gameId: current.id,
      playerId: input.playerId,
      moveData: input.moveData,
      moveNumber: moves.length + 1,
      createdAt: new Date(),
    };
    moves.push(row);
    current = { ...current, gameState: input.gameState };
    return { game: current, move: row };
  },
  getGameById: async () => current,
  getGameByCode: async () => current,
  listMoves: async () => moves,
  nextMoveNumber: async () => moves.length + 1,
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  addMove: async (input: any) => {
    const row = { id: `m${moves.length + 1}`, ...input, createdAt: new Date() };
    moves.push(row);
    return row;
  },
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  updateGame: async (_id: string, patch: any) => {
    current = { ...current, ...patch, updatedAt: new Date() };
    return current;
  },
  seatPlayer: async () => true,
};

const profiles = {
  getProfileByUserId: async (userId: string) => ({ username: userId }),
  bumpStats: async (userId: string, _gameType: string, outcome: string) => {
    bumpCalls.push({ userId, outcome });
  },
};

mock.module("@kyzen/database", () => ({
  games,
  profiles,
  matchChat: {},
  accountMerge: {},
  conversations: {},
  friends: {},
  messages: { getGameCardByGameId: async () => null },
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { handleMakeMove } = await import("../src/realtime/turn-based");
const { __timerInternals, ensureClock } = await import(
  "../src/realtime/game-runner"
);
const { turnTimers } = await import("../src/realtime/turn-timer");

async function fireTurnTimeout(
  // biome-ignore lint/suspicious/noExplicitAny: fake io
  io: any,
): Promise<void> {
  await ensureClock(io, CODE);
  const key = turnTimers.armedKey(UUID);
  if (!key) throw new Error("turn clock was not armed");
  await __timerInternals.onTurnTimeout(io, UUID, key);
}

type Emit = { room?: string; event: string; payload: unknown };
function fakeIo() {
  const emits: Emit[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: fake io
  const io: any = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emits.push({ room, event, payload }),
    }),
  };
  return { emits, io };
}
function fakeSocket(userId: string) {
  const emits: Emit[] = [];
  const socket = {
    data: { userId },
    join: () => {},
    emit: (event: string, payload: unknown) => emits.push({ event, payload }),
  };
  return { emits, socket };
}

function activeGame(board: (string | null)[], currentTurn: "X" | "O") {
  return {
    id: UUID,
    code: CODE,
    gameType: TIC_TAC_TOE,
    status: "active",
    winner: null,
    gameState: { board, currentTurn },
    config: null,
    conversationId: null,
    creatorUserId: "u1",
    seatingMode: "open",
    challengedUserId: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    players: [
      { userId: "u1", username: "u1", role: "X" },
      { userId: "u2", username: "u2", role: "O" },
    ] as Player[],
  };
}

beforeEach(() => {
  moves = [];
  bumpCalls.length = 0;
  turnTimers.reset();
});

describe("onTurnTimeout - auto-move", () => {
  test("a timeout plays a flagged auto-move, advances the turn, and adds a strike", async () => {
    current = activeGame(Array(9).fill(null), "X");
    const { io, emits } = fakeIo();
    await fireTurnTimeout(io);

    expect(moves).toHaveLength(1);
    expect(current.gameState.currentTurn).toBe("O");
    expect(turnTimers.strikes(UUID, "X")).toBe(1);
    const stateEmit = emits.find((e) => e.event === "game_state");
    expect(
      (stateEmit?.payload as { move?: { auto?: boolean } }).move?.auto,
    ).toBe(true);
  });
});

describe("onTurnTimeout - abort", () => {
  test("a third consecutive timeout aborts and the responding opponent wins", async () => {
    current = activeGame(Array(9).fill(null), "X");
    turnTimers.setStrikes(UUID, "X", 2);
    const { io, emits } = fakeIo();
    await fireTurnTimeout(io);

    expect(current.status).toBe("aborted");
    expect(current.winner).toBe("u2");
    expect(emits).toContainEqual({
      room: `game:${CODE}`,
      event: "game_over",
      payload: { winner: "u2" },
    });
    expect(bumpCalls).toContainEqual({ userId: "u2", outcome: "won" });
    expect(bumpCalls).toContainEqual({ userId: "u1", outcome: "lost" });
    expect(moves).toHaveLength(0);
  });

  test("a mutually AFK abort records no winner and bumps nobody", async () => {
    current = activeGame(Array(9).fill(null), "X");
    turnTimers.setStrikes(UUID, "X", 2);
    turnTimers.setStrikes(UUID, "O", 1);
    const { io, emits } = fakeIo();
    await fireTurnTimeout(io);

    expect(current.status).toBe("aborted");
    expect(current.winner).toBeNull();
    expect(emits).toContainEqual({
      room: `game:${CODE}`,
      event: "game_over",
      payload: { winner: null },
    });
    expect(bumpCalls).toHaveLength(0);
  });
});

describe("stale turn timeouts", () => {
  test("a timeout armed for an earlier state never punishes the next player", async () => {
    current = activeGame(Array(9).fill(null), "X");
    const { io, emits } = fakeIo();
    await ensureClock(io, CODE);
    const staleKey = turnTimers.armedKey(UUID);
    if (!staleKey) throw new Error("turn clock was not armed");
    const { socket } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    await handleMakeMove(io as any, socket as any, {
      gameId: CODE,
      moveData: { row: 0, col: 0 },
    });
    expect(moves).toHaveLength(1);
    await __timerInternals.onTurnTimeout(io, UUID, staleKey);
    expect(moves).toHaveLength(1);
    expect(turnTimers.strikes(UUID, "O")).toBe(0);
    expect(current.status).toBe("active");
    expect(emits.filter((e) => e.event === "game_over")).toHaveLength(0);
  });
});

describe("a real move resets the mover's strikes", () => {
  test("making a move clears accumulated strikes", async () => {
    current = activeGame(Array(9).fill(null), "X");
    turnTimers.setStrikes(UUID, "X", 2);
    const { io } = fakeIo();
    const { socket } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    await handleMakeMove(io as any, socket as any, {
      gameId: CODE,
      moveData: { row: 0, col: 0 },
    });
    expect(turnTimers.strikes(UUID, "X")).toBe(0);
  });
});
