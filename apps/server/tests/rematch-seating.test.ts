import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { computeRematchSeating } from "../src/chat/rematch-seating";

type Player = { userId: string; username: string; role: string };

function prev(winner: string | null, players?: Player[]): GameRecord {
  return {
    gameType: TIC_TAC_TOE,
    winner,
    players: players ?? [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
  } as unknown as GameRecord;
}

describe("computeRematchSeating (2 players)", () => {
  test("loser of a decisive game goes first", () => {
    expect(computeRematchSeating(prev("u1"))).toEqual(["u2", "u1"]);
    expect(computeRematchSeating(prev("u2"))).toEqual(["u1", "u2"]);
  });

  test("a draw swaps the previous first mover", () => {
    expect(computeRematchSeating(prev("draw"))).toEqual(["u2", "u1"]);
  });

  test("a null winner is treated like a draw and swaps the first mover", () => {
    expect(computeRematchSeating(prev(null))).toEqual(["u2", "u1"]);
  });

  test("orders by engine role index regardless of player insertion order", () => {
    const reversed = prev("u1", [
      { userId: "u2", username: "riya", role: "O" },
      { userId: "u1", username: "aman", role: "X" },
    ]);
    expect(computeRematchSeating(reversed)).toEqual(["u2", "u1"]);
  });

  test("does not mutate the previous game's players array", () => {
    const p = prev("u1");
    const before = JSON.parse(JSON.stringify(p.players));
    computeRematchSeating(p);
    expect(p.players).toEqual(before);
  });
});

describe("computeRematchSeating (N > 2 fallback)", () => {
  test("rotates the starting seat by one (head to tail)", () => {
    const three = prev("uA", [
      { userId: "uA", username: "a", role: "0" },
      { userId: "uB", username: "b", role: "1" },
      { userId: "uC", username: "c", role: "2" },
    ]);
    expect(computeRematchSeating(three)).toEqual(["uB", "uC", "uA"]);
  });

  test("ignores the winner for the N > 2 rotation", () => {
    const draw = prev("draw", [
      { userId: "uA", username: "a", role: "0" },
      { userId: "uB", username: "b", role: "1" },
      { userId: "uC", username: "c", role: "2" },
    ]);
    expect(computeRematchSeating(draw)).toEqual(["uB", "uC", "uA"]);
  });
});
