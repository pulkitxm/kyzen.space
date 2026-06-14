import { describe, expect, test } from "bun:test";
import type {
  ConversationMemberRow,
  ConversationRow,
  FriendshipRow,
  GameRecord,
  MessageRow,
  NotificationRow,
  PublicUserRow,
} from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import {
  gameJsonSchema,
  moveJsonSchema,
  seriesDetailSchema,
} from "@kyzen/shared/types";
import {
  serializeConversation,
  serializeFriendship,
  serializeGame,
  serializeMember,
  serializeMessage,
  serializeMove,
  serializeNotification,
  serializePublicUser,
  serializeSeries,
} from "../src/api/serialize";

const baseRow: GameRecord = {
  id: "g1",
  code: "K7P2QX",
  gameType: TIC_TAC_TOE,
  status: "active",
  winner: null,
  gameState: { board: Array(9).fill(null), currentTurn: "X" },
  config: null,
  conversationId: null,
  creatorUserId: "u1",
  seatingMode: "open",
  challengedUserId: null,
  seriesId: "g1",
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  players: [{ userId: "u1", username: "alice", role: "X" }],
};

describe("serializeGame", () => {
  test("maps fields, players, and ISO dates", () => {
    const g = serializeGame(baseRow);
    expect(g.id).toBe("K7P2QX");
    expect(g.gameType).toBe("tic-tac-toe");
    expect(g.status).toBe("active");
    expect(g.players).toEqual([{ userId: "u1", username: "alice", role: "X" }]);
    expect(g.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(g.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(g.completedAt).toBeNull();
    expect(g.gameState).toEqual({
      board: Array(9).fill(null),
      currentTurn: "X",
    });
  });

  test("coerces an absent game state to null", () => {
    const g = serializeGame({ ...baseRow, gameState: null });
    expect(g.gameState).toBeNull();
  });

  test("emits empty players when none are seated", () => {
    const g = serializeGame({ ...baseRow, players: [] });
    expect(g.players).toEqual([]);
  });
});

describe("serializeMove", () => {
  test("maps fields and the ISO date", () => {
    const m = serializeMove(
      {
        id: "m1",
        gameId: "g1",
        moveNumber: 1,
        playerId: "u1",
        moveData: { row: 0, col: 0 },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      "K7P2QX",
    );
    expect(m).toEqual({
      id: "m1",
      gameId: "K7P2QX",
      moveNumber: 1,
      playerId: "u1",
      moveData: { row: 0, col: 0 },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

const alice: PublicUserRow = {
  id: "u1",
  username: "alice",
  displayName: "Alice A",
  avatar: null,
};

const bob: PublicUserRow = {
  id: "u2",
  username: "bob",
  displayName: "Bob B",
  avatar: null,
};

const T0 = new Date("2026-01-01T00:00:00.000Z");

describe("serializePublicUser", () => {
  test("maps the four public fields", () => {
    expect(serializePublicUser(alice)).toEqual({
      id: "u1",
      username: "alice",
      displayName: "Alice A",
      avatar: null,
    });
  });

  test("preserves a present avatar and a null displayName", () => {
    const avatar = { style: "any" } as unknown as PublicUserRow["avatar"];
    const out = serializePublicUser({
      ...alice,
      displayName: null,
      avatar,
    });
    expect(out.displayName).toBeNull();
    expect(out.avatar).toBe(avatar);
  });
});

describe("serializeFriendship", () => {
  const row: FriendshipRow = {
    id: "f1",
    requesterId: "u1",
    addresseeId: "u2",
    pairKey: "u1:u2",
    status: "pending",
    createdAt: T0,
    updatedAt: T0,
    respondedAt: null,
  };

  test("direction is outgoing when the viewer is the requester", () => {
    const out = serializeFriendship(row, "u1", bob);
    expect(out.direction).toBe("outgoing");
    expect(out.user).toEqual(serializePublicUser(bob));
    expect(out.status).toBe("pending");
    expect(out.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("direction is incoming when the viewer is not the requester", () => {
    const out = serializeFriendship(row, "u2", alice);
    expect(out.direction).toBe("incoming");
    expect(out.user.id).toBe("u1");
  });
});

describe("serializeMember", () => {
  const baseMember: ConversationMemberRow = {
    id: "cm1",
    conversationId: "c1",
    userId: "u1",
    role: "member",
    lastReadMessageId: null,
    lastReadAt: null,
    muted: false,
    joinedAt: T0,
    leftAt: null,
  };

  test("merges the public user with the membership role", () => {
    expect(serializeMember(baseMember, alice)).toEqual({
      ...serializePublicUser(alice),
      role: "member",
    });
  });

  test("carries the owner and admin roles through", () => {
    expect(serializeMember({ ...baseMember, role: "owner" }, alice).role).toBe(
      "owner",
    );
    expect(serializeMember({ ...baseMember, role: "admin" }, alice).role).toBe(
      "admin",
    );
  });
});

describe("serializeMessage", () => {
  const live: MessageRow = {
    id: "m1",
    conversationId: "c1",
    senderId: "u1",
    kind: "text",
    body: "hello there",
    metadata: null,
    gameId: null,
    createdAt: T0,
    editedAt: null,
    deletedAt: null,
  };

  test("exposes body and metadata for a live message", () => {
    const gif = {
      provider: "klipy",
      providerId: "x",
      previewUrl: "https://e.test/p",
      fullUrl: "https://e.test/f",
      width: 1,
      height: 1,
    } as const;
    const out = serializeMessage(
      { ...live, kind: "gif", body: null, metadata: gif },
      alice,
    );
    expect(out.body).toBeNull();
    expect(out.metadata).toEqual(gif);
    expect(out.sender).toEqual(serializePublicUser(alice));
    expect(out.kind).toBe("gif");
    expect(out.deletedAt).toBeNull();
  });

  test("redacts body and metadata once soft-deleted", () => {
    const gif = {
      provider: "klipy",
      providerId: "x",
      previewUrl: "https://e.test/p",
      fullUrl: "https://e.test/f",
      width: 1,
      height: 1,
    } as const;
    const out = serializeMessage(
      {
        ...live,
        body: "secret",
        metadata: gif,
        deletedAt: new Date("2026-02-02T00:00:00.000Z"),
      },
      alice,
    );
    expect(out.body).toBeNull();
    expect(out.metadata).toBeNull();
    expect(out.deletedAt).toBe("2026-02-02T00:00:00.000Z");
  });

  test("emits a null sender when none is supplied (system message)", () => {
    const out = serializeMessage(
      { ...live, kind: "system", senderId: null },
      null,
    );
    expect(out.sender).toBeNull();
  });

  test("coalesces an absent metadata to null on a live message", () => {
    const out = serializeMessage({ ...live, metadata: null }, alice);
    expect(out.metadata).toBeNull();
  });
});

describe("serializeConversation", () => {
  const memberRow = (userId: string): ConversationMemberRow => ({
    id: `cm-${userId}`,
    conversationId: "c1",
    userId,
    role: "member",
    lastReadMessageId: null,
    lastReadAt: null,
    muted: false,
    joinedAt: T0,
    leftAt: null,
  });

  const group: ConversationRow = {
    id: "c1",
    kind: "group",
    name: "Squad",
    avatarUrl: null,
    createdBy: "u1",
    dmKey: null,
    lastMessageId: null,
    lastMessageAt: T0,
    createdAt: T0,
    updatedAt: T0,
  };

  test("keeps a group's stored name and maps members", () => {
    const out = serializeConversation(group, {
      viewerId: "u1",
      members: [
        { member: memberRow("u1"), user: alice },
        { member: memberRow("u2"), user: bob },
      ],
      lastMessage: null,
      unreadCount: 3,
    });
    expect(out.name).toBe("Squad");
    expect(out.unreadCount).toBe(3);
    expect(out.members.map((m) => m.id)).toEqual(["u1", "u2"]);
    expect(out.lastMessageAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("a DM is named after the other member's display name", () => {
    const dm: ConversationRow = { ...group, kind: "dm", name: null };
    const out = serializeConversation(dm, {
      viewerId: "u1",
      members: [
        { member: memberRow("u1"), user: alice },
        { member: memberRow("u2"), user: bob },
      ],
      lastMessage: null,
      unreadCount: 0,
    });
    expect(out.name).toBe("Bob B");
  });

  test("a DM falls back to the other member's username when display name is null", () => {
    const dm: ConversationRow = { ...group, kind: "dm", name: null };
    const out = serializeConversation(dm, {
      viewerId: "u1",
      members: [
        { member: memberRow("u1"), user: alice },
        { member: memberRow("u2"), user: { ...bob, displayName: null } },
      ],
      lastMessage: null,
      unreadCount: 0,
    });
    expect(out.name).toBe("bob");
  });

  test("a DM with no other member resolves to a null name", () => {
    const dm: ConversationRow = { ...group, kind: "dm", name: null };
    const out = serializeConversation(dm, {
      viewerId: "u1",
      members: [{ member: memberRow("u1"), user: alice }],
      lastMessage: null,
      unreadCount: 0,
    });
    expect(out.name).toBeNull();
  });
});

describe("serializeNotification", () => {
  const row: NotificationRow = {
    id: "n1",
    userId: "u1",
    type: "friend_request",
    actorId: "u2",
    payload: { requestId: "r1" },
    readAt: null,
    resolvedAt: null,
    createdAt: T0,
  };

  test("serializes the actor and reports unread", () => {
    const out = serializeNotification(row, bob);
    expect(out.actor).toEqual(serializePublicUser(bob));
    expect(out.read).toBe(false);
    expect(out.payload).toEqual({ requestId: "r1" });
    expect(out.type).toBe("friend_request");
  });

  test("reports read once readAt is set and tolerates a null actor", () => {
    const out = serializeNotification(
      { ...row, readAt: T0, actorId: null },
      null,
    );
    expect(out.read).toBe(true);
    expect(out.actor).toBeNull();
  });

  test("coalesces an absent payload to an empty object", () => {
    const out = serializeNotification(
      { ...row, payload: undefined as unknown as NotificationRow["payload"] },
      bob,
    );
    expect(out.payload).toEqual({});
  });
});

describe("serializeSeries", () => {
  const ZERO_SCORE = {
    entries: [],
    draws: 0,
    completedGames: 0,
    totalGames: 0,
  };

  const players2 = [
    { userId: "u1", username: "alice", role: "X" },
    { userId: "u2", username: "bob", role: "O" },
  ];

  function seriesGame(over: Partial<GameRecord>): GameRecord {
    return { ...baseRow, players: players2, ...over } as GameRecord;
  }

  test("assigns a 1-based gameNumber in input order", () => {
    const detail = serializeSeries(
      "series-1",
      TIC_TAC_TOE,
      [
        seriesGame({ code: "AAAAAA", status: "completed", winner: "u1" }),
        seriesGame({ code: "BBBBBB", status: "completed", winner: "u2" }),
        seriesGame({ code: "CCCCCC", status: "active", winner: null }),
      ],
      ZERO_SCORE,
    );
    expect(detail.seriesId).toBe("series-1");
    expect(detail.gameType).toBe(TIC_TAC_TOE);
    expect(detail.games.map((g) => g.gameNumber)).toEqual([1, 2, 3]);
    expect(detail.games.map((g) => g.gameId)).toEqual([
      "AAAAAA",
      "BBBBBB",
      "CCCCCC",
    ]);
  });

  test("resolves a decisive winner to its username", () => {
    const detail = serializeSeries(
      "series-1",
      TIC_TAC_TOE,
      [seriesGame({ status: "completed", winner: "u2" })],
      ZERO_SCORE,
    );
    expect(detail.games[0]?.winner).toBe("u2");
    expect(detail.games[0]?.winnerUsername).toBe("bob");
  });

  test("a draw carries a null winner username", () => {
    const detail = serializeSeries(
      "series-1",
      TIC_TAC_TOE,
      [seriesGame({ status: "completed", winner: "draw" })],
      ZERO_SCORE,
    );
    expect(detail.games[0]?.winner).toBe("draw");
    expect(detail.games[0]?.winnerUsername).toBeNull();
  });

  test("an unseated winner resolves to a null username (defensive)", () => {
    const detail = serializeSeries(
      "series-1",
      TIC_TAC_TOE,
      [seriesGame({ status: "completed", winner: "ghost" })],
      ZERO_SCORE,
    );
    expect(detail.games[0]?.winner).toBe("ghost");
    expect(detail.games[0]?.winnerUsername).toBeNull();
  });

  test("an in-progress game has a null winner and ISO/null completedAt", () => {
    const detail = serializeSeries(
      "series-1",
      TIC_TAC_TOE,
      [
        seriesGame({ status: "active", winner: null, completedAt: null }),
        seriesGame({
          status: "completed",
          winner: "u1",
          completedAt: new Date("2026-01-03T00:00:00.000Z"),
        }),
      ],
      ZERO_SCORE,
    );
    expect(detail.games[0]?.winner).toBeNull();
    expect(detail.games[0]?.winnerUsername).toBeNull();
    expect(detail.games[0]?.completedAt).toBeNull();
    expect(detail.games[1]?.completedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  test("output parses against seriesDetailSchema", () => {
    const detail = serializeSeries(
      "series-1",
      TIC_TAC_TOE,
      [
        seriesGame({ status: "completed", winner: "u1" }),
        seriesGame({ status: "completed", winner: "draw" }),
        seriesGame({ status: "active", winner: null }),
      ],
      { entries: [], draws: 1, completedGames: 2, totalGames: 3 },
    );
    expect(seriesDetailSchema.safeParse(detail).success).toBe(true);
  });

  test("an empty series serializes to no games", () => {
    const detail = serializeSeries("series-1", TIC_TAC_TOE, [], ZERO_SCORE);
    expect(detail.games).toEqual([]);
    expect(seriesDetailSchema.safeParse(detail).success).toBe(true);
  });
});

describe("serialize → wire schema round-trips", () => {
  test("serializeGame output parses against gameJsonSchema", () => {
    const json = serializeGame(baseRow);
    expect(gameJsonSchema.safeParse(json).success).toBe(true);
  });

  test("a completed game with a winner round-trips", () => {
    const json = serializeGame({
      ...baseRow,
      status: "completed",
      winner: "u1",
      completedAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    const parsed = gameJsonSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  test("serializeMove output parses against moveJsonSchema", () => {
    const json = serializeMove(
      {
        id: "m1",
        gameId: "g1",
        moveNumber: 0,
        playerId: "u1",
        moveData: { row: 1, col: 2 },
        createdAt: T0,
      },
      "K7P2QX",
    );
    expect(moveJsonSchema.safeParse(json).success).toBe(true);
  });
});
