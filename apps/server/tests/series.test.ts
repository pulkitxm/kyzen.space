import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@kyzen/database";
import { computeSeriesScore } from "../src/chat/series";

type Player = {
  userId: string;
  username: string;
  role: string;
  avatar?: unknown;
};

function game(
  status: string,
  winner: string | null,
  players?: Player[],
): GameRecord {
  return {
    players: players ?? [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
    status,
    winner,
  } as unknown as GameRecord;
}

describe("computeSeriesScore", () => {
  test("credits both teammates for a Turbo Pitch series win", () => {
    const match = game("completed", "blue1", [
      { userId: "blue1", username: "one", role: "blue-1" },
      { userId: "orange1", username: "two", role: "orange-1" },
      { userId: "blue2", username: "three", role: "blue-2" },
      { userId: "orange2", username: "four", role: "orange-2" },
    ]);
    match.gameType = "car-football";
    expect(
      computeSeriesScore([match]).entries.map((entry) => entry.wins),
    ).toEqual([1, 0, 1, 0]);
  });
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

  test("a series of all draws credits no wins", () => {
    const score = computeSeriesScore([
      game("completed", "draw"),
      game("completed", "draw"),
      game("completed", "draw"),
    ]);
    expect(score.draws).toBe(3);
    expect(score.completedGames).toBe(3);
    expect(score.totalGames).toBe(3);
    expect(score.entries.every((e) => e.wins === 0)).toBe(true);
  });

  test("a winner absent from every roster credits nobody (defensive)", () => {
    const score = computeSeriesScore([game("completed", "ghost")]);
    expect(score.completedGames).toBe(1);
    expect(score.draws).toBe(0);
    expect(score.entries.every((e) => e.wins === 0)).toBe(true);
    expect(score.entries.find((e) => e.userId === "ghost")).toBeUndefined();
  });

  test("carries each player's avatar into its entry", () => {
    const avatar = { top: "ShortHairTheCaesar" };
    const score = computeSeriesScore([
      game("completed", "u1", [
        { userId: "u1", username: "aman", role: "X", avatar },
        { userId: "u2", username: "riya", role: "O" },
      ]),
    ]);
    const aman = score.entries.find((e) => e.userId === "u1");
    const riya = score.entries.find((e) => e.userId === "u2");
    expect(aman?.avatar as unknown).toBe(avatar);
    expect(riya?.avatar).toBeNull();
  });

  test("seeds an entry from the first game a player appears in", () => {
    const score = computeSeriesScore([
      game("completed", "u1", [
        { userId: "u1", username: "aman", role: "X" },
        { userId: "u2", username: "riya", role: "O" },
      ]),
      game("completed", "u3", [
        { userId: "u1", username: "aman", role: "X" },
        { userId: "u3", username: "neha", role: "O" },
      ]),
    ]);
    expect(score.entries.map((e) => e.userId).sort()).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
    expect(score.entries.find((e) => e.userId === "u1")?.wins).toBe(1);
    expect(score.entries.find((e) => e.userId === "u3")?.wins).toBe(1);
    expect(score.entries.find((e) => e.userId === "u2")?.wins).toBe(0);
  });
});
