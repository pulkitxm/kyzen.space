import { beforeEach, describe, expect, it, mock } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import {
  InMemoryMatchmakingStore,
  queueKey,
  RedisMatchmakingStore,
} from "../src/realtime/matchmaking-store";

type EnqueueCall = { gameType: string; userId: string; score: number };

const enqueueCalls: EnqueueCall[] = [];
let pairResult: [string, string] | null = null;

const fakeStore = {
  enqueue: async (gameType: string, userId: string, score: number) => {
    enqueueCalls.push({ gameType, userId, score });
  },
  remove: async () => {},
  removeFromAll: async () => {},
  pairAndPop: async () => pairResult,
  members: async () => [],
  size: async () => 0,
};

mock.module("../src/realtime/matchmaking-store", () => ({
  matchmakingStore: fakeStore,
  InMemoryMatchmakingStore,
  RedisMatchmakingStore,
  queueKey,
}));

const { attachMatchmakingHandlers } = await import(
  "../src/realtime/matchmaking"
);

type Emit = { event: string; payload: unknown };

function fakeIo() {
  return {
    to: () => ({ emit: () => {} }),
  };
}

function fakeSocket(userId: string) {
  const emits: Emit[] = [];
  const handlers = new Map<string, (payload: unknown) => void>();
  const socket = {
    data: { userId },
    on: (event: string, fn: (payload: unknown) => void) => {
      handlers.set(event, fn);
    },
    emit: (event: string, payload: unknown) => {
      emits.push({ event, payload });
    },
  };
  return { emits, handlers, socket };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("attachMatchmakingHandlers game:queue_join", () => {
  beforeEach(() => {
    enqueueCalls.length = 0;
    pairResult = null;
  });

  it("enqueues a valid join for a registered game type", async () => {
    const { socket, handlers, emits } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    attachMatchmakingHandlers(fakeIo() as any, socket as any);
    handlers.get("game:queue_join")?.({ gameType: TIC_TAC_TOE });
    await flush();

    expect(enqueueCalls).toHaveLength(1);
    expect(enqueueCalls[0]?.gameType).toBe(TIC_TAC_TOE);
    expect(enqueueCalls[0]?.userId).toBe("u1");
    expect(typeof enqueueCalls[0]?.score).toBe("number");
    expect(emits).toHaveLength(0);
  });

  it("rejects a malformed payload without enqueueing and emits game_error", async () => {
    const { socket, handlers, emits } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    attachMatchmakingHandlers(fakeIo() as any, socket as any);
    handlers.get("game:queue_join")?.({ gameType: TIC_TAC_TOE, sneaky: true });
    await flush();

    expect(enqueueCalls).toHaveLength(0);
    expect(emits).toEqual([
      {
        event: "game_error",
        payload: { message: "Invalid queue_join payload" },
      },
    ]);
  });

  it("rejects a join with an unknown game type at the schema layer", async () => {
    const { socket, handlers, emits } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    attachMatchmakingHandlers(fakeIo() as any, socket as any);
    handlers.get("game:queue_join")?.({ gameType: "chess" });
    await flush();

    expect(enqueueCalls).toHaveLength(0);
    expect(emits).toEqual([
      {
        event: "game_error",
        payload: { message: "Invalid queue_join payload" },
      },
    ]);
  });
});

describe("attachMatchmakingHandlers game:queue_leave", () => {
  it("rejects a malformed leave payload and emits game_error", async () => {
    const { socket, handlers, emits } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    attachMatchmakingHandlers(fakeIo() as any, socket as any);
    handlers.get("game:queue_leave")?.({ gameType: 42 });
    await flush();

    expect(emits).toEqual([
      {
        event: "game_error",
        payload: { message: "Invalid queue_leave payload" },
      },
    ]);
  });

  it("rejects a leave with an extra key", async () => {
    const { socket, handlers, emits } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake io/socket
    attachMatchmakingHandlers(fakeIo() as any, socket as any);
    handlers.get("game:queue_leave")?.({ gameType: TIC_TAC_TOE, extra: 1 });
    await flush();

    expect(emits).toEqual([
      {
        event: "game_error",
        payload: { message: "Invalid queue_leave payload" },
      },
    ]);
  });
});
