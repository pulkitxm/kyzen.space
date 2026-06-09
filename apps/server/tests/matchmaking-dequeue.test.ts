import { describe, expect, it, mock } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import {
  InMemoryMatchmakingStore,
  queueKey,
  RedisMatchmakingStore,
} from "../src/realtime/matchmaking-store";

const sharedStore = new InMemoryMatchmakingStore();

mock.module("../src/realtime/matchmaking-store", () => ({
  matchmakingStore: sharedStore,
  InMemoryMatchmakingStore,
  RedisMatchmakingStore,
  queueKey,
}));

const { dequeueUserFromAllQueues, handleQueueLeave } = await import(
  "../src/realtime/matchmaking"
);

describe("dequeueUserFromAllQueues", () => {
  it("removes the user from every queue they are in", async () => {
    await sharedStore.enqueue(TIC_TAC_TOE, "gone", 1);
    await sharedStore.enqueue(TIC_TAC_TOE, "stay", 2);
    await sharedStore.enqueue("connect-four", "gone", 3);

    await dequeueUserFromAllQueues("gone");

    expect(await sharedStore.members(TIC_TAC_TOE)).toEqual(["stay"]);
    expect(await sharedStore.members("connect-four")).toEqual([]);
  });

  it("handleQueueLeave removes the user from only the named queue", async () => {
    await sharedStore.enqueue(TIC_TAC_TOE, "leaver", 10);
    await sharedStore.enqueue("connect-four", "leaver", 11);

    await handleQueueLeave("leaver", { gameType: TIC_TAC_TOE });

    expect(await sharedStore.members(TIC_TAC_TOE)).not.toContain("leaver");
    expect(await sharedStore.members("connect-four")).toEqual(["leaver"]);
  });
});
