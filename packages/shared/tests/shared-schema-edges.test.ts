import { describe, expect, test } from "bun:test";
import {
  COLOR_MODES,
  DEFAULT_CHAT_W,
  DEFAULT_POPOUT,
  GLASS_MODES,
  MAX_CHAT,
  MAX_CHAT_POPOUT_H,
  MAX_CHAT_POPOUT_W,
  MIN_CHAT,
  MIN_CHAT_POPOUT_H,
  MIN_CHAT_POPOUT_W,
  PATTERN_IDS,
  THEME_IDS,
  TIC_TAC_TOE,
} from "../src/constants";
import {
  clientCreateGameInConversationSchema,
  colorModeSchema,
  displayNameSchema,
  gameStatusSchema,
  glassModeSchema,
  moveJsonSchema,
  notificationPayloadSchema,
  patternIdSchema,
  seatingModeSchema,
  themeIdSchema,
  ticTacToeConfigSchema,
  usernameSchema,
} from "../src/types";

describe("themeIdSchema", () => {
  test("accepts every catalog theme id", () => {
    for (const id of THEME_IDS) expect(themeIdSchema.parse(id)).toBe(id);
  });

  test("rejects an unknown theme id and a non-string", () => {
    expect(themeIdSchema.safeParse("neon").success).toBe(false);
    expect(themeIdSchema.safeParse("AMBER").success).toBe(false);
    expect(themeIdSchema.safeParse(1).success).toBe(false);
    expect(themeIdSchema.safeParse(null).success).toBe(false);
  });
});

describe("colorModeSchema", () => {
  test("accepts every color mode", () => {
    for (const m of COLOR_MODES) expect(colorModeSchema.parse(m)).toBe(m);
  });

  test("rejects an unknown mode and a wrong case", () => {
    expect(colorModeSchema.safeParse("sepia").success).toBe(false);
    expect(colorModeSchema.safeParse("Dark").success).toBe(false);
  });
});

describe("patternIdSchema", () => {
  test("accepts every catalog pattern id including none", () => {
    for (const id of PATTERN_IDS) expect(patternIdSchema.parse(id)).toBe(id);
    expect(patternIdSchema.parse("none")).toBe("none");
  });

  test("rejects an unknown pattern id", () => {
    expect(patternIdSchema.safeParse("scribbles").success).toBe(false);
    expect(patternIdSchema.safeParse("").success).toBe(false);
  });
});

describe("glassModeSchema", () => {
  test("accepts every glass mode", () => {
    for (const m of GLASS_MODES) expect(glassModeSchema.parse(m)).toBe(m);
  });

  test("rejects an unknown glass mode", () => {
    expect(glassModeSchema.safeParse("frosted").success).toBe(false);
  });
});

describe("gameStatusSchema", () => {
  test("accepts each of the four statuses", () => {
    for (const s of ["waiting", "active", "completed", "abandoned"] as const) {
      expect(gameStatusSchema.parse(s)).toBe(s);
    }
  });

  test("rejects an unknown status and a wrong case", () => {
    expect(gameStatusSchema.safeParse("paused").success).toBe(false);
    expect(gameStatusSchema.safeParse("Active").success).toBe(false);
    expect(gameStatusSchema.safeParse("").success).toBe(false);
  });
});

describe("seatingModeSchema", () => {
  test("accepts open and challenge", () => {
    expect(seatingModeSchema.parse("open")).toBe("open");
    expect(seatingModeSchema.parse("challenge")).toBe("challenge");
  });

  test("rejects an unknown seating mode", () => {
    expect(seatingModeSchema.safeParse("ranked").success).toBe(false);
    expect(seatingModeSchema.safeParse("OPEN").success).toBe(false);
  });
});

describe("usernameSchema (regex length boundaries)", () => {
  test("accepts the minimum-length name (3 chars)", () => {
    expect(usernameSchema.safeParse("abc").success).toBe(true);
  });

  test("rejects one below the minimum (2 chars)", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  test("accepts the maximum-length name (30 chars)", () => {
    expect(usernameSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  test("rejects one above the maximum (31 chars)", () => {
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  test("accepts lowercase letters, digits, and underscore", () => {
    expect(usernameSchema.safeParse("a_b_2").success).toBe(true);
  });

  test("rejects uppercase, spaces, hyphens, and dots", () => {
    expect(usernameSchema.safeParse("Alice").success).toBe(false);
    expect(usernameSchema.safeParse("al ice").success).toBe(false);
    expect(usernameSchema.safeParse("al-ice").success).toBe(false);
    expect(usernameSchema.safeParse("al.ice").success).toBe(false);
  });

  test("rejects the empty string", () => {
    expect(usernameSchema.safeParse("").success).toBe(false);
  });
});

describe("displayNameSchema (max-length boundary)", () => {
  test("accepts the empty string and a name at the 50-char cap", () => {
    expect(displayNameSchema.safeParse("").success).toBe(true);
    expect(displayNameSchema.safeParse("x".repeat(50)).success).toBe(true);
  });

  test("rejects one above the 50-char cap", () => {
    expect(displayNameSchema.safeParse("x".repeat(51)).success).toBe(false);
  });

  test("rejects a non-string", () => {
    expect(displayNameSchema.safeParse(5).success).toBe(false);
  });
});

describe("ticTacToeConfigSchema (empty strict object)", () => {
  test("accepts an empty object", () => {
    expect(ticTacToeConfigSchema.safeParse({}).success).toBe(true);
  });

  test("rejects any key (strict)", () => {
    expect(ticTacToeConfigSchema.safeParse({ firstMove: "X" }).success).toBe(
      false,
    );
  });

  test("rejects a non-object", () => {
    expect(ticTacToeConfigSchema.safeParse(null).success).toBe(false);
    expect(ticTacToeConfigSchema.safeParse([]).success).toBe(false);
  });
});

describe("notificationPayloadSchema (intentionally loose, all optional)", () => {
  test("accepts an empty payload", () => {
    expect(notificationPayloadSchema.safeParse({}).success).toBe(true);
  });

  test("accepts a friend-request shape and a game-start shape", () => {
    expect(
      notificationPayloadSchema.safeParse({ requestId: "r1" }).success,
    ).toBe(true);
    expect(
      notificationPayloadSchema.safeParse({
        gameId: "K7P2QX",
        gameType: TIC_TAC_TOE,
        conversationId: "c1",
      }).success,
    ).toBe(true);
  });

  test("validates gameType against the registry", () => {
    expect(
      notificationPayloadSchema.safeParse({ gameType: "chess" }).success,
    ).toBe(false);
  });

  test("rejects a non-string gameId", () => {
    expect(notificationPayloadSchema.safeParse({ gameId: 5 }).success).toBe(
      false,
    );
  });
});

describe("clientCreateGameInConversationSchema", () => {
  const base = { conversationId: "c1", gameType: TIC_TAC_TOE };

  test("accepts a minimal payload", () => {
    expect(clientCreateGameInConversationSchema.safeParse(base).success).toBe(
      true,
    );
  });

  test("accepts an open or challenge seatingMode and a null challengedUserId", () => {
    expect(
      clientCreateGameInConversationSchema.safeParse({
        ...base,
        seatingMode: "challenge",
        challengedUserId: null,
      }).success,
    ).toBe(true);
  });

  test("carries opaque config through (validated later by the game schema)", () => {
    expect(
      clientCreateGameInConversationSchema.safeParse({
        ...base,
        config: { anything: true },
      }).success,
    ).toBe(true);
  });

  test("rejects an empty conversationId (.min(1))", () => {
    expect(
      clientCreateGameInConversationSchema.safeParse({
        ...base,
        conversationId: "",
      }).success,
    ).toBe(false);
  });

  test("rejects an unknown game type at the parse boundary", () => {
    expect(
      clientCreateGameInConversationSchema.safeParse({
        ...base,
        gameType: "chess",
      }).success,
    ).toBe(false);
  });

  test("rejects an unknown seatingMode", () => {
    expect(
      clientCreateGameInConversationSchema.safeParse({
        ...base,
        seatingMode: "ranked",
      }).success,
    ).toBe(false);
  });

  test("rejects an unknown extra key (strict)", () => {
    expect(
      clientCreateGameInConversationSchema.safeParse({ ...base, evil: 1 })
        .success,
    ).toBe(false);
  });
});

describe("moveJsonSchema", () => {
  const base = {
    id: "m1",
    gameId: "g1",
    moveNumber: 0,
    playerId: "u1",
    moveData: { row: 0, col: 0 },
  };

  test("accepts moveNumber zero with opaque moveData and an optional createdAt", () => {
    expect(moveJsonSchema.safeParse(base).success).toBe(true);
    expect(moveJsonSchema.safeParse({ ...base, createdAt: null }).success).toBe(
      true,
    );
    expect(
      moveJsonSchema.safeParse({ ...base, createdAt: "2030-01-01" }).success,
    ).toBe(true);
  });

  test("rejects a negative or non-integer moveNumber", () => {
    expect(moveJsonSchema.safeParse({ ...base, moveNumber: -1 }).success).toBe(
      false,
    );
    expect(moveJsonSchema.safeParse({ ...base, moveNumber: 2.5 }).success).toBe(
      false,
    );
  });

  test("rejects a missing id, gameId, or playerId", () => {
    for (const key of ["id", "gameId", "playerId"] as const) {
      const partial = { ...base };
      delete (partial as Record<string, unknown>)[key];
      expect(moveJsonSchema.safeParse(partial).success).toBe(false);
    }
  });
});

describe("chat-layout numeric bounds", () => {
  test("the chat width bounds are coherent and the default sits inside them", () => {
    expect(MIN_CHAT).toBeLessThan(MAX_CHAT);
    expect(DEFAULT_CHAT_W).toBeGreaterThanOrEqual(MIN_CHAT);
    expect(DEFAULT_CHAT_W).toBeLessThanOrEqual(MAX_CHAT);
  });

  test("the popout bounds are coherent and the default geometry fits within them", () => {
    expect(MIN_CHAT_POPOUT_W).toBeLessThan(MAX_CHAT_POPOUT_W);
    expect(MIN_CHAT_POPOUT_H).toBeLessThan(MAX_CHAT_POPOUT_H);
    expect(DEFAULT_POPOUT.w).toBeGreaterThanOrEqual(MIN_CHAT_POPOUT_W);
    expect(DEFAULT_POPOUT.w).toBeLessThanOrEqual(MAX_CHAT_POPOUT_W);
    expect(DEFAULT_POPOUT.h).toBeGreaterThanOrEqual(MIN_CHAT_POPOUT_H);
    expect(DEFAULT_POPOUT.h).toBeLessThanOrEqual(MAX_CHAT_POPOUT_H);
  });
});
