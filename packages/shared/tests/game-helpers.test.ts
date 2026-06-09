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
});

describe("resolveWinnerUsername", () => {
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
});
