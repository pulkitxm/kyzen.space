import { describe, expect, test } from "bun:test";
import { listGameTypes } from "@gamelobby/games-core";
import { getGameClient, getGameSkeleton } from "../src/registry";
import { DefaultGameSkeleton } from "../src/skeletons";

const gameTypes = listGameTypes();

describe("games-client registry", () => {
  test("at least one game type is registered in games-core", () => {
    expect(gameTypes.length).toBeGreaterThan(0);
  });

  describe("every registered game has a board UI", () => {
    for (const type of gameTypes) {
      test(`getGameClient("${type}") returns a component`, () => {
        const client = getGameClient(type);
        expect(client).not.toBeNull();
        expect(["function", "object"]).toContain(typeof client);
      });
    }
  });

  describe("every registered game has a skeleton", () => {
    for (const type of gameTypes) {
      test(`getGameSkeleton("${type}") returns a component`, () => {
        const skeleton = getGameSkeleton(type);
        expect(skeleton).toBeTruthy();
        expect(["function", "object"]).toContain(typeof skeleton);
      });
    }
  });

  test("getGameClient returns null for an unknown game type", () => {
    expect(getGameClient("__no_such_game__")).toBeNull();
  });

  test("getGameSkeleton falls back to DefaultGameSkeleton for an unknown game type", () => {
    expect(getGameSkeleton("__no_such_game__")).toBe(DefaultGameSkeleton);
  });
});
