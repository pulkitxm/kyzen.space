import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  clientJoinRoomSchema,
  clientMakeMoveSchema,
  gameJsonSchema,
  gamePlayerSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "../src/types";

const UUID = "11111111-1111-1111-1111-111111111111";

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
  test("clientJoinRoom requires a uuid game id", () => {
    expect(clientJoinRoomSchema.safeParse({ gameId: "nope" }).success).toBe(
      false,
    );
    expect(clientJoinRoomSchema.safeParse({ gameId: UUID }).success).toBe(true);
  });

  test("clientJoinRoom rejects unknown keys", () => {
    expect(
      clientJoinRoomSchema.safeParse({ gameId: UUID, evil: 1 }).success,
    ).toBe(false);
  });

  test("clientMakeMove carries opaque moveData with a uuid id", () => {
    expect(
      clientMakeMoveSchema.safeParse({
        gameId: UUID,
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
