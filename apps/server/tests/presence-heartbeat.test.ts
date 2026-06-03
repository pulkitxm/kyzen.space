import { beforeEach, describe, expect, it, mock } from "bun:test";

const refreshCalls: Array<[string, string]> = [];
const touchLastSeenCalls: Array<{ userIds: string[]; when: Date }> = [];

mock.module("../src/env", () => ({
  env: {
    logLevel: "silent",
    presenceHeartbeatMs: 10000,
    presenceLastSeenPersistMs: 60000,
  },
}));

mock.module("../src/realtime/presence-store", () => ({
  presenceStore: {
    refresh: async (userId: string, socketId: string) => {
      refreshCalls.push([userId, socketId]);
    },
  },
}));

mock.module("../src/db", () => ({
  profiles: {
    touchLastSeen: async (userIds: string[], when: Date) => {
      touchLastSeenCalls.push({ userIds, when });
    },
  },
}));

const { refreshPresence, persistLastSeen } = await import(
  "../src/realtime/presence-heartbeat"
);

function fakeIo(sockets: Array<{ id: string; userId?: string }>) {
  const map = new Map(
    sockets.map((s) => [s.id, { id: s.id, data: { userId: s.userId } }]),
  );
  return { sockets: { sockets: map } } as never;
}

beforeEach(() => {
  refreshCalls.length = 0;
  touchLastSeenCalls.length = 0;
});

describe("refreshPresence", () => {
  it("refreshes every local socket that has a userId", async () => {
    await refreshPresence(
      fakeIo([
        { id: "s1", userId: "u1" },
        { id: "s2", userId: "u2" },
        { id: "s3" },
      ]),
    );
    expect(refreshCalls.sort()).toEqual([
      ["u1", "s1"],
      ["u2", "s2"],
    ]);
  });
});

describe("persistLastSeen", () => {
  it("writes one batched touchLastSeen with distinct userIds", async () => {
    await persistLastSeen(
      fakeIo([
        { id: "s1", userId: "u1" },
        { id: "s2", userId: "u1" },
        { id: "s3", userId: "u2" },
      ]),
    );
    expect(touchLastSeenCalls).toHaveLength(1);
    expect(touchLastSeenCalls[0]?.userIds.sort()).toEqual(["u1", "u2"]);
  });

  it("does not write when no sockets are connected", async () => {
    await persistLastSeen(fakeIo([]));
    expect(touchLastSeenCalls).toHaveLength(0);
  });
});
