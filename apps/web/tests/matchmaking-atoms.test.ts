import { describe, expect, it } from "bun:test";
import { createStore } from "jotai";
import { matchmakingAtom } from "@/lib/matchmaking-atoms";

describe("matchmakingAtom", () => {
  it("defaults to idle (searching = null)", () => {
    const store = createStore();
    expect(store.get(matchmakingAtom)).toEqual({ searching: null });
  });

  it("tracks the gameType currently being searched", () => {
    const store = createStore();
    store.set(matchmakingAtom, { searching: "tic-tac-toe" });
    expect(store.get(matchmakingAtom)).toEqual({ searching: "tic-tac-toe" });
    store.set(matchmakingAtom, { searching: null });
    expect(store.get(matchmakingAtom).searching).toBeNull();
  });

  it("idle to searching to matched clears the search", () => {
    const store = createStore();
    expect(store.get(matchmakingAtom).searching).toBeNull();
    store.set(matchmakingAtom, { searching: "tic-tac-toe" });
    expect(store.get(matchmakingAtom).searching).toBe("tic-tac-toe");
    store.set(matchmakingAtom, { searching: null });
    expect(store.get(matchmakingAtom).searching).toBeNull();
  });

  it("idle to searching to cancelled clears the search", () => {
    const store = createStore();
    store.set(matchmakingAtom, { searching: "tic-tac-toe" });
    store.set(matchmakingAtom, { searching: null });
    expect(store.get(matchmakingAtom)).toEqual({ searching: null });
  });

  it("switching search target overwrites the previous gameType", () => {
    const store = createStore();
    store.set(matchmakingAtom, { searching: "tic-tac-toe" });
    store.set(matchmakingAtom, { searching: "connect-four" });
    expect(store.get(matchmakingAtom)).toEqual({ searching: "connect-four" });
  });
});
