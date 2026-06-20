import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  addMoveInputSchema,
  appearancePatchSchema,
  createGameInputSchema,
  createMessageInputSchema,
  createNotificationInputSchema,
  createProfileInputSchema,
  messageKindSchema,
  recordAccountMergeInputSchema,
} from "../src/types";

const VALID_PLAYER = { userId: "u1", username: "aman", role: "X" };

describe("createGameInputSchema", () => {
  const base = {
    gameType: TIC_TAC_TOE,
    players: [VALID_PLAYER],
    gameState: { board: Array(9).fill(null), currentTurn: "X" },
  };

  test("accepts the minimal required shape", () => {
    expect(createGameInputSchema.safeParse(base).success).toBe(true);
  });

  test("rejects an unknown game type via gameTypeSchema", () => {
    expect(
      createGameInputSchema.safeParse({ ...base, gameType: "chess" }).success,
    ).toBe(false);
  });

  test("rejects a player with an empty userId (gamePlayerSchema .min(1))", () => {
    expect(
      createGameInputSchema.safeParse({
        ...base,
        players: [{ userId: "", username: "aman", role: "X" }],
      }).success,
    ).toBe(false);
  });

  test("rejects a player carrying an extra key (gamePlayerSchema is strict)", () => {
    expect(
      createGameInputSchema.safeParse({
        ...base,
        players: [{ ...VALID_PLAYER, isAdmin: true }],
      }).success,
    ).toBe(false);
  });

  test("rejects a missing players array", () => {
    const { players: _drop, ...withoutPlayers } = base;
    expect(createGameInputSchema.safeParse(withoutPlayers).success).toBe(false);
  });

  test("accepts a null seriesId, conversationId, and creatorUserId", () => {
    expect(
      createGameInputSchema.safeParse({
        ...base,
        seriesId: null,
        conversationId: null,
        creatorUserId: null,
      }).success,
    ).toBe(true);
  });

  test("rejects an invalid status enum", () => {
    expect(
      createGameInputSchema.safeParse({ ...base, status: "paused" }).success,
    ).toBe(false);
  });

  test("rejects an invalid seatingMode enum", () => {
    expect(
      createGameInputSchema.safeParse({ ...base, seatingMode: "ranked" })
        .success,
    ).toBe(false);
  });

  test("accepts a null seatingMode", () => {
    expect(
      createGameInputSchema.safeParse({ ...base, seatingMode: null }).success,
    ).toBe(true);
  });
});

describe("addMoveInputSchema", () => {
  const base = {
    gameId: "g1",
    moveNumber: 0,
    playerId: "u1",
    moveData: { row: 0, col: 0 },
  };

  test("accepts moveNumber zero (nonnegative boundary)", () => {
    expect(addMoveInputSchema.safeParse(base).success).toBe(true);
  });

  test("rejects a negative moveNumber", () => {
    expect(
      addMoveInputSchema.safeParse({ ...base, moveNumber: -1 }).success,
    ).toBe(false);
  });

  test("rejects a non-integer moveNumber", () => {
    expect(
      addMoveInputSchema.safeParse({ ...base, moveNumber: 1.5 }).success,
    ).toBe(false);
  });

  test("rejects a missing playerId", () => {
    const { playerId: _drop, ...partial } = base;
    expect(addMoveInputSchema.safeParse(partial).success).toBe(false);
  });

  test("accepts unknown opaque moveData", () => {
    expect(
      addMoveInputSchema.safeParse({ ...base, moveData: { anything: true } })
        .success,
    ).toBe(true);
  });
});

describe("createMessageInputSchema", () => {
  test("accepts a minimal text message with a null sender", () => {
    expect(
      createMessageInputSchema.safeParse({
        conversationId: "c1",
        senderId: null,
      }).success,
    ).toBe(true);
  });

  test("rejects a missing senderId key (senderId is required, only its value may be null)", () => {
    expect(
      createMessageInputSchema.safeParse({ conversationId: "c1" }).success,
    ).toBe(false);
  });

  test("rejects an unknown message kind", () => {
    expect(
      createMessageInputSchema.safeParse({
        conversationId: "c1",
        senderId: "u1",
        kind: "voice",
      }).success,
    ).toBe(false);
  });

  test("accepts each valid message kind", () => {
    for (const kind of ["text", "gif", "game_card", "system"] as const) {
      expect(
        createMessageInputSchema.safeParse({
          conversationId: "c1",
          senderId: "u1",
          kind,
        }).success,
      ).toBe(true);
    }
  });

  test("accepts a null body and null metadata", () => {
    expect(
      createMessageInputSchema.safeParse({
        conversationId: "c1",
        senderId: "u1",
        body: null,
        metadata: null,
      }).success,
    ).toBe(true);
  });
});

describe("messageKindSchema", () => {
  test("accepts every kind", () => {
    for (const kind of ["text", "gif", "game_card", "system"] as const) {
      expect(messageKindSchema.parse(kind)).toBe(kind);
    }
  });

  test("rejects an unknown kind", () => {
    expect(messageKindSchema.safeParse("audio").success).toBe(false);
  });
});

describe("createNotificationInputSchema", () => {
  test("accepts a notification with a known type", () => {
    expect(
      createNotificationInputSchema.safeParse({
        userId: "u1",
        type: "friend_request",
      }).success,
    ).toBe(true);
  });

  test("rejects an unknown notification type", () => {
    expect(
      createNotificationInputSchema.safeParse({
        userId: "u1",
        type: "poke",
      }).success,
    ).toBe(false);
  });

  test("rejects a missing userId", () => {
    expect(
      createNotificationInputSchema.safeParse({ type: "friend_request" })
        .success,
    ).toBe(false);
  });

  test("accepts a null actorId", () => {
    expect(
      createNotificationInputSchema.safeParse({
        userId: "u1",
        type: "game_invite",
        actorId: null,
      }).success,
    ).toBe(true);
  });
});

describe("recordAccountMergeInputSchema", () => {
  test("accepts two distinct ids", () => {
    expect(
      recordAccountMergeInputSchema.safeParse({
        anonUserId: "anon",
        targetUserId: "real",
      }).success,
    ).toBe(true);
  });

  test("rejects identical anon and target ids (the .refine differ guard)", () => {
    const r = recordAccountMergeInputSchema.safeParse({
      anonUserId: "same",
      targetUserId: "same",
    });
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0]?.message).toBe(
      "anonUserId and targetUserId must differ",
    );
  });

  test("rejects an empty anonUserId (.min(1))", () => {
    expect(
      recordAccountMergeInputSchema.safeParse({
        anonUserId: "",
        targetUserId: "real",
      }).success,
    ).toBe(false);
  });

  test("rejects an empty targetUserId (.min(1))", () => {
    expect(
      recordAccountMergeInputSchema.safeParse({
        anonUserId: "anon",
        targetUserId: "",
      }).success,
    ).toBe(false);
  });
});

describe("createProfileInputSchema", () => {
  test("accepts a minimal profile", () => {
    expect(
      createProfileInputSchema.safeParse({ userId: "u1", username: "aman" })
        .success,
    ).toBe(true);
  });

  test("rejects a missing username", () => {
    expect(createProfileInputSchema.safeParse({ userId: "u1" }).success).toBe(
      false,
    );
  });

  test("accepts a null avatar", () => {
    expect(
      createProfileInputSchema.safeParse({
        userId: "u1",
        username: "aman",
        avatar: null,
      }).success,
    ).toBe(true);
  });
});

describe("appearancePatchSchema", () => {
  test("accepts a partial patch of each axis", () => {
    expect(appearancePatchSchema.safeParse({}).success).toBe(true);
    expect(appearancePatchSchema.safeParse({ theme: "amber" }).success).toBe(
      true,
    );
    expect(
      appearancePatchSchema.safeParse({
        theme: "csk",
        colorMode: "dark",
        pattern: "space",
        glass: "tinted",
      }).success,
    ).toBe(true);
  });

  test("rejects an unknown key (strict)", () => {
    expect(
      appearancePatchSchema.safeParse({ theme: "amber", fontSize: 12 }).success,
    ).toBe(false);
  });

  test("rejects an out-of-catalog value on each axis", () => {
    expect(appearancePatchSchema.safeParse({ theme: "neon" }).success).toBe(
      false,
    );
    expect(
      appearancePatchSchema.safeParse({ colorMode: "sepia" }).success,
    ).toBe(false);
    expect(
      appearancePatchSchema.safeParse({ pattern: "scribbles" }).success,
    ).toBe(false);
    expect(appearancePatchSchema.safeParse({ glass: "frosted" }).success).toBe(
      false,
    );
  });
});
