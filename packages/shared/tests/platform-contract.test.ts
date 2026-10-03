import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  BOT_ID_PREFIX,
  botDifficultySchema,
  botId,
  clientMatchFriendSchema,
  clientRoomConfigureSchema,
  clientRoomKickSchema,
  clientRoomLeaveSchema,
  clientRoomStartSchema,
  gameJsonSchema,
  isBotId,
  LOBBY_MAX_BOTS,
  type LobbyConfig,
  lobbyBotSchema,
  lobbyConfigSchema,
  teamIdSchema,
} from "../src/types";

describe("bot identities", () => {
  test("bot ids carry the reserved prefix", () => {
    expect(BOT_ID_PREFIX).toBe("bot:");
    expect(botId(0)).toBe("bot:0");
    expect(botId(12)).toBe("bot:12");
    expect(isBotId(botId(3))).toBe(true);
  });

  test("human ids and look-alikes are not bots", () => {
    for (const id of ["u1", "bot", "bot-1", "Bot:1", "robot:1", "", " bot:1"])
      expect(isBotId(id)).toBe(false);
  });

  test("difficulties are a closed set", () => {
    for (const difficulty of ["easy", "normal", "hard"])
      expect(botDifficultySchema.safeParse(difficulty).success).toBe(true);
    expect(botDifficultySchema.safeParse("expert").success).toBe(false);
  });
});

describe("lobby config", () => {
  test("defaults to a free-for-all lobby without bots", () => {
    expect(lobbyConfigSchema.parse({})).toEqual({
      mode: "ffa",
      teams: {},
      bots: [],
    });
  });

  test("accepts team assignments and bots", () => {
    const config: LobbyConfig = {
      mode: "teams",
      teams: { u1: "A", u2: "B" },
      bots: [{ id: "bot:1", difficulty: "hard", team: "A" }],
    };
    expect(lobbyConfigSchema.parse(config)).toEqual(config);
  });

  test("team ids are a single capital letter", () => {
    expect(teamIdSchema.safeParse("A").success).toBe(true);
    for (const team of ["a", "AB", "", "1"])
      expect(teamIdSchema.safeParse(team).success).toBe(false);
  });

  test("rejects malformed bots, duplicate bot ids, and unknown keys", () => {
    expect(
      lobbyBotSchema.safeParse({ id: "u1", difficulty: "hard", team: "A" })
        .success,
    ).toBe(false);
    expect(
      lobbyBotSchema.safeParse({
        id: "bot:1",
        difficulty: "hard",
        team: "A",
        extra: true,
      }).success,
    ).toBe(false);
    const bot = { id: "bot:1", difficulty: "easy", team: "B" };
    expect(lobbyConfigSchema.safeParse({ bots: [bot, bot] }).success).toBe(
      false,
    );
    expect(lobbyConfigSchema.safeParse({ mode: "duel" }).success).toBe(false);
    expect(lobbyConfigSchema.safeParse({ rounds: 3 }).success).toBe(false);
  });

  test("caps a lobby at LOBBY_MAX_BOTS bots", () => {
    const bots = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: botId(index + 1),
        difficulty: "hard",
        team: "A",
      }));
    expect(LOBBY_MAX_BOTS).toBe(64);
    expect(
      lobbyConfigSchema.safeParse({ bots: bots(LOBBY_MAX_BOTS) }).success,
    ).toBe(true);
    expect(
      lobbyConfigSchema.safeParse({ bots: bots(LOBBY_MAX_BOTS + 1) }).success,
    ).toBe(false);
  });
});

describe("lobby and match wire payloads", () => {
  test("room:configure and room:start are strict and normalize the code", () => {
    expect(
      clientRoomConfigureSchema.parse({ gameId: "k7p2qx", config: { a: 1 } }),
    ).toEqual({ gameId: "K7P2QX", config: { a: 1 } });
    expect(clientRoomStartSchema.parse({ gameId: "k7p2qx" })).toEqual({
      gameId: "K7P2QX",
    });
    expect(
      clientRoomStartSchema.safeParse({ gameId: "K7P2QX", force: true })
        .success,
    ).toBe(false);
    expect(clientRoomStartSchema.safeParse({ gameId: "nope" }).success).toBe(
      false,
    );
    expect(
      clientRoomConfigureSchema.safeParse({ gameId: "K7P2QX", extra: 1 })
        .success,
    ).toBe(false);
  });

  test("room:leave and room:kick are strict and normalize the code", () => {
    expect(clientRoomLeaveSchema.parse({ gameId: "k7p2qx" })).toEqual({
      gameId: "K7P2QX",
    });
    expect(
      clientRoomLeaveSchema.safeParse({ gameId: "K7P2QX", userId: "u2" })
        .success,
    ).toBe(false);
    expect(
      clientRoomKickSchema.parse({ gameId: "k7p2qx", userId: "u2" }),
    ).toEqual({ gameId: "K7P2QX", userId: "u2" });
    expect(clientRoomKickSchema.safeParse({ gameId: "K7P2QX" }).success).toBe(
      false,
    );
    expect(
      clientRoomKickSchema.safeParse({ gameId: "K7P2QX", userId: "" }).success,
    ).toBe(false);
    expect(
      clientRoomKickSchema.safeParse({
        gameId: "K7P2QX",
        userId: "u2",
        reason: "x",
      }).success,
    ).toBe(false);
  });

  test("match:friend names a target player", () => {
    expect(
      clientMatchFriendSchema.parse({
        gameId: "K7P2QX",
        playerId: "K7P2QX:P2",
      }),
    ).toEqual({ gameId: "K7P2QX", playerId: "K7P2QX:P2" });
    expect(
      clientMatchFriendSchema.safeParse({ gameId: "K7P2QX" }).success,
    ).toBe(false);
    expect(
      clientMatchFriendSchema.safeParse({ gameId: "K7P2QX", playerId: "" })
        .success,
    ).toBe(false);
  });

  test("game snapshots carry config and winner lists", () => {
    const game = {
      id: "K7P2QX",
      gameType: TIC_TAC_TOE,
      status: "completed",
      winner: null,
      winners: ["u1", "bot:1"],
      config: { mode: "teams" },
      players: [],
      gameState: null,
    };
    expect(gameJsonSchema.safeParse(game).success).toBe(true);
    expect(gameJsonSchema.safeParse({ ...game, winners: [1] }).success).toBe(
      false,
    );
    expect(
      gameJsonSchema.safeParse({ ...game, winners: undefined }).success,
    ).toBe(true);
  });
});
