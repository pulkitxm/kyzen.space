import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  avatarConfigSchema,
  clientJoinRoomSchema,
  clientMakeMoveSchema,
  gameJsonSchema,
  gamePlayerSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "../src/types";

const CODE = "K7P2QX";

const SAMPLE_AVATAR = {
  skinColor: "edb98a",
  top: "shortFlat",
  hairColor: "2c1b18",
  hatColor: "3c4f5c",
  accessories: "none",
  accessoriesColor: "000000",
  facialHair: "none",
  facialHairColor: "2c1b18",
  clothing: "shirtCrewNeck",
  clothesColor: "3c4f5c",
  eyes: "default",
  eyebrows: "default",
  mouth: "smile",
  backgroundColor: "b6e3f4",
};

describe("tic-tac-toe move schema (strict)", () => {
  test("accepts in-range integer coordinates", () => {
    expect(ticTacToeMoveSchema.safeParse({ row: 0, col: 2 }).success).toBe(
      true,
    );
  });

  test("rejects out-of-range coordinates", () => {
    expect(ticTacToeMoveSchema.safeParse({ row: 3, col: 0 }).success).toBe(
      false,
    );
    expect(ticTacToeMoveSchema.safeParse({ row: -1, col: 0 }).success).toBe(
      false,
    );
  });

  test("rejects non-integers", () => {
    expect(ticTacToeMoveSchema.safeParse({ row: 1.5, col: 0 }).success).toBe(
      false,
    );
  });

  test("rejects unknown keys (strict)", () => {
    expect(
      ticTacToeMoveSchema.safeParse({ row: 0, col: 0, cheat: true }).success,
    ).toBe(false);
  });
});

describe("tic-tac-toe state schema (strict)", () => {
  test("requires exactly nine cells", () => {
    expect(
      ticTacToeStateSchema.safeParse({
        board: Array(9).fill(null),
        currentTurn: "X",
      }).success,
    ).toBe(true);
    expect(
      ticTacToeStateSchema.safeParse({
        board: Array(8).fill(null),
        currentTurn: "X",
      }).success,
    ).toBe(false);
  });

  test("rejects invalid cell + turn values", () => {
    expect(
      ticTacToeStateSchema.safeParse({
        board: Array(9).fill("Z"),
        currentTurn: "X",
      }).success,
    ).toBe(false);
    expect(
      ticTacToeStateSchema.safeParse({
        board: Array(9).fill(null),
        currentTurn: "Z",
      }).success,
    ).toBe(false);
  });
});

describe("wire payload schemas", () => {
  test("clientJoinRoom requires a valid game code", () => {
    expect(clientJoinRoomSchema.safeParse({ gameId: "nope" }).success).toBe(
      false,
    );
    expect(clientJoinRoomSchema.safeParse({ gameId: CODE }).success).toBe(true);
  });

  test("clientJoinRoom normalizes a lowercase game code", () => {
    const parsed = clientJoinRoomSchema.safeParse({ gameId: "k7p2qx" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.gameId).toBe(CODE);
  });

  test("clientJoinRoom rejects unknown keys", () => {
    expect(
      clientJoinRoomSchema.safeParse({ gameId: CODE, evil: 1 }).success,
    ).toBe(false);
  });

  test("clientMakeMove carries opaque moveData with a game code", () => {
    expect(
      clientMakeMoveSchema.safeParse({
        gameId: CODE,
        moveData: { row: 0, col: 0 },
      }).success,
    ).toBe(true);
    expect(
      clientMakeMoveSchema.safeParse({ gameId: "bad", moveData: {} }).success,
    ).toBe(false);
  });

  test("gamePlayer rejects empty fields", () => {
    expect(
      gamePlayerSchema.safeParse({ userId: "", username: "a", role: "X" })
        .success,
    ).toBe(false);
    expect(
      gamePlayerSchema.safeParse({ userId: "u1", username: "a", role: "X" })
        .success,
    ).toBe(true);
  });

  test("gamePlayer accepts an optional or null avatar", () => {
    expect(
      gamePlayerSchema.safeParse({
        userId: "u1",
        username: "a",
        role: "X",
        avatar: null,
      }).success,
    ).toBe(true);
    expect(
      gamePlayerSchema.safeParse({
        userId: "u1",
        username: "a",
        role: "O",
        avatar: SAMPLE_AVATAR,
      }).success,
    ).toBe(true);
  });

  test("gameJson accepts a serialized game", () => {
    expect(
      gameJsonSchema.safeParse({
        id: "g1",
        gameType: TIC_TAC_TOE,
        status: "active",
        winner: null,
        players: [{ userId: "u1", username: "a", role: "X" }],
        gameState: { board: Array(9).fill(null), currentTurn: "X" },
      }).success,
    ).toBe(true);
  });

  test("gameJson rejects an invalid status", () => {
    expect(
      gameJsonSchema.safeParse({
        id: "g1",
        gameType: TIC_TAC_TOE,
        status: "exploded",
        winner: null,
        players: [],
      }).success,
    ).toBe(false);
  });

  test("gameJson rejects an unknown gameType", () => {
    expect(
      gameJsonSchema.safeParse({
        id: "g1",
        gameType: "chess",
        status: "active",
        winner: null,
        players: [],
      }).success,
    ).toBe(false);
  });
});

describe("avatar config schema", () => {
  test("accepts a full avatar config", () => {
    expect(avatarConfigSchema.safeParse(SAMPLE_AVATAR).success).toBe(true);
  });

  test("accepts an optional style", () => {
    expect(
      avatarConfigSchema.safeParse({ ...SAMPLE_AVATAR, style: "feminine" })
        .success,
    ).toBe(true);
    expect(
      avatarConfigSchema.safeParse({ ...SAMPLE_AVATAR, style: "wizard" })
        .success,
    ).toBe(false);
  });

  test("rejects a missing required field", () => {
    const { backgroundColor: _omit, ...partial } = SAMPLE_AVATAR;
    expect(avatarConfigSchema.safeParse(partial).success).toBe(false);
  });
});
