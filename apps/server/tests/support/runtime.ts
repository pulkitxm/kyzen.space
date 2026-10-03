import { mock } from "bun:test";
import * as core from "@kyzen/games-core";
import type { GamePlayer, GameRecord } from "@kyzen/shared/types";
import { FAKE_ROUNDS, fakeRoundsDefinition } from "./fake-rounds";
import { createMemoryGames, type MemoryGames } from "./memory-games";

const real = { ...core };

export type Emit = { room?: string; event: string; payload: unknown };

export function installFakeRegistry(): void {
  mock.module("@kyzen/games-core", () => ({
    ...real,
    hasEngine: (type: string) => type === FAKE_ROUNDS || real.hasEngine(type),
    getDefinition: (type: string) =>
      type === FAKE_ROUNDS ? fakeRoundsDefinition : real.getDefinition(type),
    getEngine: (type: string) =>
      type === FAKE_ROUNDS ? fakeRoundsDefinition.engine : real.getEngine(type),
  }));
}

export function installRuntime(
  extra: Record<string, unknown> = {},
): MemoryGames {
  const memory = createMemoryGames();
  installFakeRegistry();
  mock.module("@kyzen/database", () => ({
    games: memory.games,
    profiles: {
      getProfileByUserId: async (userId: string) => ({
        userId,
        username: `name-${userId}`,
      }),
      bumpStats: async () => {},
    },
    messages: { getGameCardByGameId: async () => null },
    matchChat: {},
    accountMerge: {},
    conversations: {},
    friends: {},
    notifications: {},
    db: {},
    schema: {},
    createDb: () => ({ db: {}, client: {} }),
    ...extra,
  }));
  return memory;
}

export function fakeIo() {
  const emits: Emit[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emits.push({ room, event, payload }),
    }),
  };
  return { emits, io: io as never };
}

export function fakeSocket(userId: string) {
  const emits: Emit[] = [];
  const socket = {
    data: { userId },
    id: `socket-${userId}`,
    join: () => {},
    emit: (event: string, payload: unknown) => emits.push({ event, payload }),
  };
  return { emits, socket: socket as never };
}

let sequence = 0;

export function lobbyRow(
  humans: string[],
  config: unknown,
  over: Partial<GameRecord> = {},
): GameRecord {
  sequence += 1;
  const players: GamePlayer[] = humans.map((userId, index) => ({
    userId,
    username: `name-${userId}`,
    role: `P${index + 1}`,
    avatar: null,
  }));
  return {
    id: `lobby-${sequence}`,
    code: `K${String(sequence).padStart(5, "0")}`,
    publicMatch: false,
    gameType: FAKE_ROUNDS as GameRecord["gameType"],
    status: "waiting",
    winner: null,
    winners: [],
    gameState: null,
    config,
    conversationId: null,
    creatorUserId: humans[0] ?? null,
    seatingMode: "open",
    challengedUserId: null,
    seriesId: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    players,
    ...over,
  };
}

export function lobbyConfig(over: Record<string, unknown> = {}) {
  return { mode: "ffa", teams: {}, bots: [], ...over };
}
