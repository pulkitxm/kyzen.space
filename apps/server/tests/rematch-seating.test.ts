import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { computeRematchSeating } from "../src/chat/rematch-seating";

function prev(winner: string | null): GameRecord {
  return {
    gameType: TIC_TAC_TOE,
    winner,
    players: [
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
});
