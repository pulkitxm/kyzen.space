import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { getGameClient, getGameSkeleton } from "../src/registry";
import { DefaultGameSkeleton } from "../src/skeletons";

describe("getGameClient fallthrough", () => {
  test("the empty string resolves to null, not a board", () => {
    expect(getGameClient("")).toBeNull();
  });

  test("a near-miss slug resolves to null", () => {
    expect(getGameClient("tic_tac_toe")).toBeNull();
    expect(getGameClient("TIC-TAC-TOE")).toBeNull();
    expect(getGameClient(" tic-tac-toe ")).toBeNull();
  });

  test("prototype keys never resolve to a board", () => {
    for (const key of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "__proto__",
    ]) {
      expect(getGameClient(key)).toBeNull();
    }
  });

  test("a registered type resolves to a component", () => {
    expect(getGameClient(TIC_TAC_TOE)).not.toBeNull();
  });
});

describe("getGameSkeleton fallthrough", () => {
  test("the empty string falls back to the default skeleton", () => {
    expect(getGameSkeleton("")).toBe(DefaultGameSkeleton);
  });

  test("a near-miss slug falls back to the default skeleton", () => {
    expect(getGameSkeleton("tic_tac_toe")).toBe(DefaultGameSkeleton);
    expect(getGameSkeleton("TIC-TAC-TOE")).toBe(DefaultGameSkeleton);
  });

  test("prototype keys use the default skeleton", () => {
    for (const key of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "__proto__",
    ]) {
      expect(getGameSkeleton(key)).toBe(DefaultGameSkeleton);
    }
  });

  test("a registered type resolves to its own skeleton, not the default", () => {
    expect(getGameSkeleton(TIC_TAC_TOE)).not.toBe(DefaultGameSkeleton);
  });
});
