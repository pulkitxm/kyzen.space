import { beforeEach, describe, expect, it } from "bun:test";
import {
  type HeartbeatDeps,
  persistLastSeen,
  refreshPresence,
  startPresenceHeartbeats,
} from "../src/realtime/presence-heartbeat";

const REFRESH_REJECT_SOCKET_ID = "reject-socket";
const refreshCalls: Array<[string, string]> = [];
const touchLastSeenCalls: Array<{ userIds: string[]; when: Date }> = [];

function makeDeps(): HeartbeatDeps {
  return {
    store: {
      refresh: async (userId: string, socketId: string) => {
        refreshCalls.push([userId, socketId]);
        if (socketId === REFRESH_REJECT_SOCKET_ID) {
          throw new Error("refresh failed");
        }
      },
    },
    touchLastSeen: async (userIds: string[], when: Date) => {
      touchLastSeenCalls.push({ userIds, when });
    },
  };
}

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
      makeDeps(),
    );
    expect(refreshCalls.sort()).toEqual([
      ["u1", "s1"],
      ["u2", "s2"],
    ]);
  });

  it("tolerates a rejecting refresh and still refreshes the rest", async () => {
    await refreshPresence(
      fakeIo([
        { id: "s1", userId: "u1" },
        { id: REFRESH_REJECT_SOCKET_ID, userId: "u2" },
        { id: "s3", userId: "u3" },
      ]),
      makeDeps(),
    );
    expect(refreshCalls.sort()).toEqual([
      ["u1", "s1"],
      ["u2", REFRESH_REJECT_SOCKET_ID],
      ["u3", "s3"],
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
      makeDeps(),
    );
    expect(touchLastSeenCalls).toHaveLength(1);
    expect(touchLastSeenCalls[0]?.userIds.sort()).toEqual(["u1", "u2"]);
  });

  it("does not write when no sockets are connected", async () => {
    await persistLastSeen(fakeIo([]), makeDeps());
    expect(touchLastSeenCalls).toHaveLength(0);
  });
});

describe("startPresenceHeartbeats", () => {
  it("returns a disposer that can be called without throwing", () => {
    const dispose = startPresenceHeartbeats(fakeIo([]));
    expect(typeof dispose).toBe("function");
    expect(() => dispose()).not.toThrow();
  });
});
