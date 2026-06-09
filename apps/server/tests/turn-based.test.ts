import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const UUID = "11111111-1111-1111-1111-111111111111";
const CODE = "K7P2QX";

type Player = { userId: string; username: string; role: string };
type GameRec = {
  id: string;
  code: string;
  gameType: string;
  status: string;
  winner: string | null;
  gameState: unknown;
  config: unknown;
  conversationId: string | null;
  creatorUserId: string | null;
  seatingMode: "open" | "challenge" | null;
  challengedUserId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  players: Player[];
};

let current: GameRec;
// biome-ignore lint/suspicious/noExplicitAny: test move store
let moves: any[] = [];
let lookupCalls = 0;
const seatCalls: { player: Player; seatOrder: number }[] = [];
const bumpCalls: { userId: string; outcome: string }[] = [];

const games = {
  getGameById: async () => current,
  getGameByCode: async () => {
    lookupCalls++;
    return current;
  },
  listMoves: async () => moves,
  nextMoveNumber: async () => moves.length + 1,
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  addMove: async (input: any) => {
    const row = { id: `m${moves.length + 1}`, ...input, createdAt: new Date() };
    moves.push(row);
    return row;
  },
  seatPlayer: async (_gameId: string, player: Player, seatOrder: number) => {
    if (current.players.some((p) => p.userId === player.userId)) return false;
    seatCalls.push({ player, seatOrder });
    current.players = [...current.players, player];
    return true;
  },
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  updateGame: async (_id: string, patch: any) => {
    current = { ...current, ...patch, updatedAt: new Date() };
    return current;
  },
};

const profiles = {
  getProfileByUserId: async (userId: string) => ({ username: userId }),
  bumpStats: async (userId: string, _gameType: string, outcome: string) => {
    bumpCalls.push({ userId, outcome });
  },
};

mock.module("@gamelobby/database", () => ({
  games,
  profiles,
  conversations: {},
  friends: {},
  messages: { getGameCardByGameId: async () => null },
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { handleJoinRoom, handleMakeMove } = await import(
  "../src/realtime/turn-based"
);

type Emit = { room?: string; event: string; payload: unknown };

function fakeIo() {
  const emits: Emit[] = [];
  const io = {
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

function freshGame(over: Partial<GameRec> = {}): GameRec {
  return {
    id: UUID,
    code: CODE,
    gameType: TIC_TAC_TOE,
    status: "waiting",
    winner: null,
    gameState: { board: Array(9).fill(null), currentTurn: "X" },
    config: null,
    conversationId: null,
    creatorUserId: "u1",
    seatingMode: "open",
    challengedUserId: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    players: [{ userId: "u1", username: "u1", role: "X" }],
    ...over,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: fake io/socket
const call = (fn: any, io: any, socket: any, payload: any) =>
  fn(io, socket, payload);

beforeEach(() => {
  current = freshGame();
  moves = [];
  lookupCalls = 0;
  seatCalls.length = 0;
  bumpCalls.length = 0;
});

describe("handleJoinRoom - seating", () => {
  test("seats a second player and activates the game", async () => {
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u2");
    await call(handleJoinRoom, io, socket, { gameId: CODE });

    expect(seatCalls).toHaveLength(1);
    expect(seatCalls[0]).toMatchObject({
      player: { userId: "u2", role: "O" },
      seatOrder: 1,
    });
    expect(current.status).toBe("active");
    expect(emits.some((e) => e.event === "game_state")).toBe(true);
  });

  test("spectate intent never seats", async () => {
    const { io } = fakeIo();
    const { socket } = fakeSocket("u2");
    await call(handleJoinRoom, io, socket, {
      gameId: CODE,
      intent: "spectate",
    });
    expect(seatCalls).toHaveLength(0);
    expect(current.status).toBe("waiting");
  });

  test("a full/active game routes newcomers to spectating", async () => {
    current = freshGame({
      status: "active",
      players: [
        { userId: "u1", username: "u1", role: "X" },
        { userId: "u2", username: "u2", role: "O" },
      ],
    });
    const { io } = fakeIo();
    const { socket } = fakeSocket("u3");
    await call(handleJoinRoom, io, socket, { gameId: CODE });
    expect(seatCalls).toHaveLength(0);
  });

  test("a reserved challenge seat blocks everyone but the challenged user", async () => {
    current = freshGame({
      seatingMode: "challenge",
      challengedUserId: "u2",
      players: [{ userId: "u1", username: "u1", role: "X" }],
    });
    const { io } = fakeIo();
    const intruder = fakeSocket("u3");
    await call(handleJoinRoom, io, intruder.socket, { gameId: CODE });
    expect(seatCalls).toHaveLength(0);

    const challenged = fakeSocket("u2");
    await call(handleJoinRoom, io, challenged.socket, { gameId: CODE });
    expect(seatCalls).toHaveLength(1);
    expect(seatCalls[0]?.player.userId).toBe("u2");
  });

  test("a lost seating race surfaces no error and performs no stale write", async () => {
    const original = games.seatPlayer;
    games.seatPlayer = async () => false;
    try {
      const { io, emits } = fakeIo();
      const { socket, emits: sockEmits } = fakeSocket("u2");
      await call(handleJoinRoom, io, socket, { gameId: CODE });

      expect(sockEmits.some((e) => e.event === "game_error")).toBe(false);
      expect(emits.some((e) => e.event === "game_state")).toBe(true);
      expect(current.status).toBe("waiting");
      expect(current.players).toHaveLength(1);
    } finally {
      games.seatPlayer = original;
    }
  });

  test("an already-seated player rejoins without re-seating", async () => {
    current = freshGame({
      status: "active",
      players: [
        { userId: "u1", username: "u1", role: "X" },
        { userId: "u2", username: "u2", role: "O" },
      ],
    });
    const { io } = fakeIo();
    const { socket } = fakeSocket("u1");
    await call(handleJoinRoom, io, socket, { gameId: CODE });
    expect(seatCalls).toHaveLength(0);
    expect(current.status).toBe("active");
  });
});

describe("handleMakeMove - validation", () => {
  function activeGame() {
    return freshGame({
      status: "active",
      players: [
        { userId: "u1", username: "u1", role: "X" },
        { userId: "u2", username: "u2", role: "O" },
      ],
    });
  }

  test("rejects a non-player", async () => {
    current = activeGame();
    const { io } = fakeIo();
    const { socket, emits } = fakeSocket("u3");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 0, col: 0 },
    });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Not a player in this game" },
    });
    expect(moves).toHaveLength(0);
  });

  test("rejects a move when the game is not active", async () => {
    current = freshGame({ status: "waiting" });
    const { io } = fakeIo();
    const { socket, emits } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 0, col: 0 },
    });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Game is not active" },
    });
  });

  test("rejects a structurally-invalid move via Zod", async () => {
    current = activeGame();
    const { io } = fakeIo();
    const { socket, emits } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 5, col: 0 },
    });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Invalid move" },
    });
    expect(moves).toHaveLength(0);
  });

  test("rejects corrupt stored game state", async () => {
    current = activeGame();
    current.gameState = { board: Array(8).fill(null), currentTurn: "X" };
    const { io } = fakeIo();
    const { socket, emits } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 0, col: 0 },
    });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Corrupt game state" },
    });
    expect(moves).toHaveLength(0);
  });
});

describe("handleMakeMove - applying moves", () => {
  function activeGame(over: Partial<GameRec> = {}) {
    return freshGame({
      status: "active",
      players: [
        { userId: "u1", username: "u1", role: "X" },
        { userId: "u2", username: "u2", role: "O" },
      ],
      ...over,
    });
  }

  test("persists a valid move, advances the turn, and broadcasts", async () => {
    current = activeGame();
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 1, col: 1 },
    });

    expect(moves).toHaveLength(1);
    expect((current.gameState as { currentTurn: string }).currentTurn).toBe(
      "O",
    );
    expect(current.status).toBe("active");
    const stateEmit = emits.find((e) => e.event === "game_state");
    expect(stateEmit).toBeDefined();
    expect((stateEmit?.payload as { move?: unknown }).move).toBeDefined();
    expect((stateEmit?.payload as { moves?: unknown }).moves).toBeUndefined();
    expect(emits.some((e) => e.event === "move_made")).toBe(false);
    expect(emits.some((e) => e.event === "game_over")).toBe(false);
  });

  test("a winning move completes the game and bumps stats", async () => {
    current = activeGame({
      gameState: {
        board: ["X", "X", null, "O", "O", null, null, null, null],
        currentTurn: "X",
      },
    });
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 0, col: 2 },
    });

    expect(current.status).toBe("completed");
    expect(current.winner).toBe("u1");
    expect(emits).toContainEqual({
      room: `game:${CODE}`,
      event: "game_over",
      payload: { winner: "u1" },
    });
    expect(bumpCalls).toContainEqual({ userId: "u1", outcome: "won" });
    expect(bumpCalls).toContainEqual({ userId: "u2", outcome: "lost" });
  });

  test("a drawing move completes the game with winner draw and bumps both as drawn", async () => {
    current = activeGame({
      gameState: {
        board: ["X", "O", "X", "X", "O", "O", "O", "X", null],
        currentTurn: "X",
      },
    });
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 2, col: 2 },
    });

    expect(current.status).toBe("completed");
    expect(current.winner).toBe("draw");
    expect(emits).toContainEqual({
      room: `game:${CODE}`,
      event: "game_over",
      payload: { winner: "draw" },
    });
    expect(bumpCalls).toContainEqual({ userId: "u1", outcome: "drawn" });
    expect(bumpCalls).toContainEqual({ userId: "u2", outcome: "drawn" });
    expect(bumpCalls.filter((c) => c.outcome === "won")).toHaveLength(0);
    expect(bumpCalls.filter((c) => c.outcome === "lost")).toHaveLength(0);
  });

  test("the game-over broadcast and stat bumps fire exactly once on a winning move", async () => {
    current = activeGame({
      gameState: {
        board: ["X", "X", null, "O", "O", null, null, null, null],
        currentTurn: "X",
      },
    });
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 0, col: 2 },
    });

    expect(emits.filter((e) => e.event === "game_over")).toHaveLength(1);
    expect(bumpCalls).toHaveLength(2);
  });

  test("does not emit game_over or bump stats on a non-terminal move", async () => {
    current = activeGame();
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u1");
    await call(handleMakeMove, io, socket, {
      gameId: CODE,
      moveData: { row: 0, col: 0 },
    });

    expect(emits.some((e) => e.event === "game_over")).toBe(false);
    expect(bumpCalls).toHaveLength(0);
  });
});

const INVALID_IDS = [
  "11111111-1111-1111-1111-111111111111",
  "ABCDE",
  "ABCDEFG",
  "K7P2QU",
  "K7P2Q-",
  "",
];

describe("handleJoinRoom - code guard", () => {
  for (const bad of INVALID_IDS) {
    test(`rejects ${JSON.stringify(bad)} without a DB lookup or broadcast`, async () => {
      const { io, emits } = fakeIo();
      const { socket, emits: sockEmits } = fakeSocket("u2");
      await call(handleJoinRoom, io, socket, { gameId: bad });
      expect(sockEmits).toContainEqual({
        event: "game_error",
        payload: { message: "Invalid game id" },
      });
      expect(lookupCalls).toBe(0);
      expect(seatCalls).toHaveLength(0);
      expect(emits).toHaveLength(0);
    });
  }

  test("accepts a lowercase code and keys the room by the stored canonical code", async () => {
    const { io, emits } = fakeIo();
    const { socket } = fakeSocket("u2");
    await call(handleJoinRoom, io, socket, {
      gameId: "k7p2qx",
      intent: "spectate",
    });
    expect(lookupCalls).toBe(1);
    expect(
      emits.some((e) => e.room === `game:${CODE}` && e.event === "game_state"),
    ).toBe(true);
  });
});

describe("handleMakeMove - code guard", () => {
  function activeGame() {
    return freshGame({
      status: "active",
      players: [
        { userId: "u1", username: "u1", role: "X" },
        { userId: "u2", username: "u2", role: "O" },
      ],
    });
  }

  for (const bad of INVALID_IDS) {
    test(`rejects ${JSON.stringify(bad)} without a DB lookup, move, or broadcast`, async () => {
      current = activeGame();
      const { io, emits } = fakeIo();
      const { socket, emits: sockEmits } = fakeSocket("u1");
      await call(handleMakeMove, io, socket, {
        gameId: bad,
        moveData: { row: 0, col: 0 },
      });
      expect(sockEmits).toContainEqual({
        event: "game_error",
        payload: { message: "Invalid game id" },
      });
      expect(lookupCalls).toBe(0);
      expect(moves).toHaveLength(0);
      expect(emits).toHaveLength(0);
    });
  }
});
