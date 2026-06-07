import { beforeEach, describe, expect, it } from "bun:test";
import {
  handlePresenceConnect,
  handlePresenceDisconnect,
  type PresenceDeps,
} from "../src/realtime/presence";

let onlineSet = new Set<string>();
let markOnlineResult = { wasOnline: false };
let markOfflineResult = { stillOnline: false };

let friendIds: string[] = [];
let convIds: string[] = [];
let memberIds: Record<string, string[]> = {};
let lastSeen = new Map<string, Date | null>();
let touchLastSeenShouldThrow = false;
const touchLastSeenCalls: Array<{ userIds: string[]; when: Date }> = [];

function makeDeps(): PresenceDeps {
  return {
    store: {
      markOnline: async () => markOnlineResult,
      markOffline: async () => markOfflineResult,
      refresh: async () => {},
      isOnline: async (userId: string) => onlineSet.has(userId),
      onlineAmong: async (ids: string[]) =>
        new Set(ids.filter((id) => onlineSet.has(id))),
    },
    acceptedFriendIds: async () => friendIds,
    conversationIdsForUser: async () => convIds,
    memberIds: async (cid: string) => memberIds[cid] ?? [],
    getLastSeen: async () => lastSeen,
    touchLastSeen: async (userIds: string[], when: Date) => {
      if (touchLastSeenShouldThrow) {
        throw new Error("touchLastSeen failed");
      }
      touchLastSeenCalls.push({ userIds, when });
    },
  };
}

type Emit = { room: string; event: string; payload: unknown };

function fakeIo(emits: Emit[]) {
  return {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) =>
        emits.push({ room, event, payload }),
    }),
  } as never;
}

function fakeSocket(userId: string, socketId: string, selfEmits: Emit[]) {
  return {
    id: socketId,
    data: { userId },
    emit: (event: string, payload: unknown) =>
      selfEmits.push({ room: "self", event, payload }),
  } as never;
}

beforeEach(() => {
  onlineSet = new Set();
  markOnlineResult = { wasOnline: false };
  markOfflineResult = { stillOnline: false };
  friendIds = [];
  convIds = [];
  memberIds = {};
  lastSeen = new Map();
  touchLastSeenShouldThrow = false;
  touchLastSeenCalls.length = 0;
});

describe("handlePresenceConnect", () => {
  it("sends a snapshot and broadcasts online to the audience when newly online", async () => {
    friendIds = ["friendA"];
    lastSeen = new Map([["friendA", new Date("2026-06-01T00:00:00.000Z")]]);

    const ioEmits: Emit[] = [];
    const selfEmits: Emit[] = [];
    await handlePresenceConnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s1", selfEmits),
      makeDeps(),
    );

    const snapshot = selfEmits.find((e) => e.event === "presence_snapshot");
    expect(snapshot).toBeDefined();
    expect((snapshot?.payload as { entries: unknown[] }).entries).toEqual([
      {
        userId: "friendA",
        status: "offline",
        lastSeen: "2026-06-01T00:00:00.000Z",
      },
    ]);

    const update = ioEmits.find((e) => e.event === "presence_update");
    expect(update?.room).toBe("user:friendA");
    expect(update?.payload).toEqual({
      userId: "me",
      status: "online",
      lastSeen: null,
    });
  });

  it("includes online audience members in the snapshot with a null lastSeen", async () => {
    friendIds = ["friendA", "friendB"];
    onlineSet = new Set(["friendB"]);
    lastSeen = new Map([["friendA", new Date("2026-06-01T00:00:00.000Z")]]);

    const selfEmits: Emit[] = [];
    await handlePresenceConnect(
      fakeIo([]),
      fakeSocket("me", "s1", selfEmits),
      makeDeps(),
    );

    const snapshot = selfEmits.find((e) => e.event === "presence_snapshot");
    const entries = (snapshot?.payload as { entries: PresenceEntryShape[] })
      .entries;
    expect(entries).toContainEqual({
      userId: "friendB",
      status: "online",
      lastSeen: null,
    });
    expect(entries).toContainEqual({
      userId: "friendA",
      status: "offline",
      lastSeen: "2026-06-01T00:00:00.000Z",
    });
  });

  it("does not broadcast online when the user was already online", async () => {
    friendIds = ["friendA"];
    markOnlineResult = { wasOnline: true };

    const ioEmits: Emit[] = [];
    const selfEmits: Emit[] = [];
    await handlePresenceConnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s2", selfEmits),
      makeDeps(),
    );

    expect(ioEmits.find((e) => e.event === "presence_update")).toBeUndefined();
  });
});

describe("handlePresenceDisconnect", () => {
  it("persists last-seen and broadcasts offline when the last socket leaves", async () => {
    friendIds = ["friendA"];
    markOfflineResult = { stillOnline: false };

    const ioEmits: Emit[] = [];
    await handlePresenceDisconnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s1", []),
      makeDeps(),
    );

    expect(touchLastSeenCalls).toHaveLength(1);
    expect(touchLastSeenCalls[0]?.userIds).toEqual(["me"]);

    const update = ioEmits.find((e) => e.event === "presence_update");
    expect(update?.room).toBe("user:friendA");
    const payload = update?.payload as {
      status: string;
      lastSeen: string | null;
    };
    expect(payload.status).toBe("offline");
    expect(typeof payload.lastSeen).toBe("string");
  });

  it("does nothing when other sockets remain online", async () => {
    friendIds = ["friendA"];
    markOfflineResult = { stillOnline: true };

    const ioEmits: Emit[] = [];
    await handlePresenceDisconnect(
      fakeIo(ioEmits),
      fakeSocket("me", "s1", []),
      makeDeps(),
    );

    expect(touchLastSeenCalls).toHaveLength(0);
    expect(ioEmits).toHaveLength(0);
  });

  it("still broadcasts offline to the audience even when touchLastSeen throws", async () => {
    friendIds = ["friendA"];
    markOfflineResult = { stillOnline: false };
    touchLastSeenShouldThrow = true;

    const ioEmits: Emit[] = [];
    await expect(
      handlePresenceDisconnect(
        fakeIo(ioEmits),
        fakeSocket("me", "s1", []),
        makeDeps(),
      ),
    ).resolves.toBeUndefined();

    expect(touchLastSeenCalls).toHaveLength(0);

    const update = ioEmits.find((e) => e.event === "presence_update");
    expect(update?.room).toBe("user:friendA");
    expect((update?.payload as { status: string }).status).toBe("offline");
  });
});

type PresenceEntryShape = {
  userId: string;
  status: string;
  lastSeen: string | null;
};
