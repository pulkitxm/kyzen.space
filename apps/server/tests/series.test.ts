import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@gamelobby/database";
import { computeSeriesScore } from "../src/chat/series";

function game(status: string, winner: string | null): GameRecord {
  return {
    players: [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
    status,
    winner,
  } as unknown as GameRecord;
}

describe("computeSeriesScore", () => {
  test("tallies wins, draws, and totals", () => {
    const score = computeSeriesScore([
      game("completed", "u1"),
      game("completed", "draw"),
      game("completed", "u1"),
      game("active", null),
    ]);
    expect(score.totalGames).toBe(4);
    expect(score.completedGames).toBe(3);
    expect(score.draws).toBe(1);
    const aman = score.entries.find((e) => e.userId === "u1");
    const riya = score.entries.find((e) => e.userId === "u2");
    expect(aman?.wins).toBe(2);
    expect(riya?.wins).toBe(0);
  });

  test("ignores abandoned games in the tally but counts totals", () => {
    const score = computeSeriesScore([
      game("completed", "u1"),
      game("abandoned", null),
    ]);
    expect(score.totalGames).toBe(2);
    expect(score.completedGames).toBe(1);
    expect(score.entries.find((e) => e.userId === "u1")?.wins).toBe(1);
  });

  test("empty series is zeroed", () => {
    const score = computeSeriesScore([]);
    expect(score).toEqual({
      entries: [],
      draws: 0,
      completedGames: 0,
      totalGames: 0,
    });
  });
});
