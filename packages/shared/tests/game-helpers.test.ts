import { describe, expect, test } from "bun:test";
import { isGameLive, isGameOver, resolveWinnerUsername } from "../src/types";

describe("isGameOver", () => {
  test("true for completed and abandoned", () => {
    expect(isGameOver("completed")).toBe(true);
    expect(isGameOver("abandoned")).toBe(true);
  });

  test("false for waiting and active", () => {
    expect(isGameOver("waiting")).toBe(false);
    expect(isGameOver("active")).toBe(false);
  });

  test("false for an unknown status string", () => {
    expect(isGameOver("paused")).toBe(false);
  });

  test("false for the empty string", () => {
    expect(isGameOver("")).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(isGameOver("Completed")).toBe(false);
    expect(isGameOver("COMPLETED")).toBe(false);
  });
});

describe("isGameLive", () => {
  test("true for waiting and active", () => {
    expect(isGameLive("waiting")).toBe(true);
    expect(isGameLive("active")).toBe(true);
  });

  test("false for completed and abandoned", () => {
    expect(isGameLive("completed")).toBe(false);
    expect(isGameLive("abandoned")).toBe(false);
  });

  test("false for an unknown status string", () => {
    expect(isGameLive("paused")).toBe(false);
  });

  test("false for the empty string", () => {
    expect(isGameLive("")).toBe(false);
  });

  test("is the complement of isGameOver for every known status", () => {
    for (const status of ["waiting", "active", "completed", "abandoned"]) {
      expect(isGameLive(status)).toBe(!isGameOver(status));
    }
  });
});

describe("resolveWinnerUsername", () => {
  test("labels a car football result with the winning team", () => {
    expect(
      resolveWinnerUsername(
        "one",
        [{ userId: "one", username: "host", role: "blue-1" }],
        "car-football",
      ),
    ).toBe("Blue team");
  });
  const players = [
    { userId: "u1", username: "aman" },
    { userId: "u2", username: "bina" },
  ];

  test("returns the winner's username", () => {
    expect(resolveWinnerUsername("u2", players)).toBe("bina");
  });

  test("returns null for a draw", () => {
    expect(resolveWinnerUsername("draw", players)).toBe(null);
  });

  test("returns null when winner is null", () => {
    expect(resolveWinnerUsername(null, players)).toBe(null);
  });

  test("returns null when the winner id is not among players", () => {
    expect(resolveWinnerUsername("u9", players)).toBe(null);
  });

  test("returns null for an empty-string winner id", () => {
    expect(resolveWinnerUsername("", players)).toBe(null);
  });

  test("returns null when players is empty", () => {
    expect(resolveWinnerUsername("u1", [])).toBe(null);
  });

  test("matches the winner id exactly (case-sensitive)", () => {
    expect(resolveWinnerUsername("U1", players)).toBe(null);
  });

  test("returns the first matching player's username on duplicate ids", () => {
    const dupes = [
      { userId: "u1", username: "first" },
      { userId: "u1", username: "second" },
    ];
    expect(resolveWinnerUsername("u1", dupes)).toBe("first");
  });

  test("treats the literal draw sentinel as a draw even if a player has that id", () => {
    const odd = [{ userId: "draw", username: "trickster" }];
    expect(resolveWinnerUsername("draw", odd)).toBe(null);
  });
});
