import { beforeEach, describe, expect, it } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { runPairing } from "../src/realtime/matchmaking";
import { InMemoryMatchmakingStore } from "../src/realtime/matchmaking-store";

type CreateMatchInput = {
  a: string;
  b: string;
  gameType: string;
  config: unknown;
};

let onlineSet = new Set<string>(["a", "b"]);
let createGameCalls: CreateMatchInput[] = [];
let createGameOk = true;
const emitted: Array<{ userId: string; gameId: string }> = [];
const requeued: Array<{ gameType: string; userId: string }> = [];

function deps() {
  return {
    onlineAmong: async (ids: string[]) =>
      new Set(ids.filter((id) => onlineSet.has(id))),
    createMatchGame: async (input: CreateMatchInput) => {
      createGameCalls.push(input);
      return createGameOk
        ? ({ ok: true, gameId: "GAMECODE" } as const)
        : ({ ok: false } as const);
    },
    emitMatch: (userId: string, gameId: string) =>
      emitted.push({ userId, gameId }),
    requeue: async (gameType: string, userId: string) =>
      void requeued.push({ gameType, userId }),
  };
}

describe("runPairing", () => {
  beforeEach(() => {
    onlineSet = new Set(["a", "b"]);
    createGameCalls = [];
    createGameOk = true;
    emitted.length = 0;
    requeued.length = 0;
  });

  it("creates the match game and emits match_found to both players", async () => {
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());

    expect(createGameCalls).toHaveLength(1);
    expect(createGameCalls[0]).toMatchObject({
      a: "a",
      b: "b",
      gameType: TIC_TAC_TOE,
    });
    expect(
      emitted
        .map((e) => ({ userId: e.userId, gameId: e.gameId }))
        .sort((x, y) => x.userId.localeCompare(y.userId)),
    ).toEqual([
      { userId: "a", gameId: "GAMECODE" },
      { userId: "b", gameId: "GAMECODE" },
    ]);
  });

  it("forwards a config object to createMatchGame", async () => {
    await runPairing(TIC_TAC_TOE, ["a", "b"], { firstMove: "O" }, deps());
    expect(createGameCalls[0]?.config).toEqual({ firstMove: "O" });
  });

  it("refuses to match a user with themselves", async () => {
    await runPairing(TIC_TAC_TOE, ["a", "a"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(emitted).toHaveLength(0);
  });

  it("requeues the survivor and aborts when one player went offline", async () => {
    onlineSet = new Set(["a"]);
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(requeued).toEqual([{ gameType: TIC_TAC_TOE, userId: "a" }]);
  });

  it("requeues b when a went offline (other ordering)", async () => {
    onlineSet = new Set(["b"]);
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(emitted).toHaveLength(0);
    expect(requeued).toEqual([{ gameType: TIC_TAC_TOE, userId: "b" }]);
  });

  it("a requeued survivor re-pairs against the next joiner", async () => {
    const store = new InMemoryMatchmakingStore();
    onlineSet = new Set(["a"]);
    const d = deps();
    d.requeue = async (gameType: string, userId: string) => {
      requeued.push({ gameType, userId });
      await store.enqueue(gameType, userId, 1);
    };

    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, d);
    expect(requeued).toEqual([{ gameType: TIC_TAC_TOE, userId: "a" }]);
    expect(await store.members(TIC_TAC_TOE)).toEqual(["a"]);

    await store.enqueue(TIC_TAC_TOE, "c", 2);
    const next = await store.pairAndPop(TIC_TAC_TOE);
    expect(next).toEqual(["a", "c"]);

    onlineSet = new Set(["a", "c"]);
    await runPairing(TIC_TAC_TOE, next as [string, string], undefined, deps());
    expect(createGameCalls).toHaveLength(1);
    expect(createGameCalls[0]).toMatchObject({ a: "a", b: "c" });
  });

  it("requeues neither when both dropped", async () => {
    onlineSet = new Set();
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(createGameCalls).toHaveLength(0);
    expect(requeued).toHaveLength(0);
  });

  it("does not emit match_found when game creation fails", async () => {
    createGameOk = false;
    await runPairing(TIC_TAC_TOE, ["a", "b"], undefined, deps());
    expect(emitted).toHaveLength(0);
  });
});
