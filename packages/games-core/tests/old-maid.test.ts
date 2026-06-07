import { describe, expect, test } from "bun:test";
import type {
  OldMaidCard,
  OldMaidMove,
  OldMaidRole,
  OldMaidState,
} from "@gamelobby/shared/types";
import {
  createInitialOldMaidState,
  createOldMaidDeck,
  oldMaidEngine,
} from "../src/index";

if (!oldMaidEngine.reduce) {
  throw new Error("old-maid engine must define reduce");
}
const reduce: NonNullable<typeof oldMaidEngine.reduce> = oldMaidEngine.reduce;

function card(
  rank: OldMaidCard["rank"],
  suit: OldMaidCard["suit"],
): OldMaidCard {
  return { id: `${rank}-${suit}`, rank, suit };
}

function state(
  hands: Record<OldMaidRole, OldMaidCard[]>,
  currentTurn: OldMaidRole = "P1",
): OldMaidState {
  return {
    activeRoles: (["P1", "P2"] as const).filter(
      (role) => hands[role].length > 0,
    ),
    currentTurn,
    deckSeed: "test-seed",
    discardedPairs: [],
    hands,
    lastDraw: null,
    loserRole: null,
    winnerRoles: [],
  };
}

function play(
  inputState: OldMaidState,
  role: OldMaidRole,
  cardIndex: number,
): OldMaidState {
  const res = reduce(inputState, { role }, { cardIndex });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

describe("old-maid — deck and initial state", () => {
  test("deck has one Joker and three Queens after removing the Queen of Spades", () => {
    const deck = createOldMaidDeck();
    expect(deck).toHaveLength(52);
    expect(deck.filter((c) => c.rank === "JOKER")).toHaveLength(1);
    expect(deck.filter((c) => c.rank === "Q")).toHaveLength(3);
    expect(deck.some((c) => c.id === "Q-S")).toBe(false);
  });

  test("initial state removes all starting pairs and stores a seed", () => {
    const initial = createInitialOldMaidState([{ role: "P1" }, { role: "P2" }]);
    expect(initial.deckSeed.length).toBeGreaterThan(0);
    expect(initial.loserRole).toBeNull();
    for (const hand of Object.values(initial.hands)) {
      const ranks = hand.filter((c) => c.rank !== "JOKER").map((c) => c.rank);
      expect(new Set(ranks).size).toBe(ranks.length);
    }
    expect(initial.discardedPairs.length).toBeGreaterThan(0);
  });
});

describe("old-maid — turn and move validation", () => {
  test("rejects an unknown role", () => {
    const res = reduce(
      state({ P1: [card("A", "H")], P2: [card("JOKER", "JOKER")] }),
      { role: "P9" },
      { cardIndex: 0 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not a player in this game");
  });

  test("rejects moving out of turn", () => {
    const res = reduce(
      state({ P1: [card("A", "H")], P2: [card("JOKER", "JOKER")] }),
      { role: "P2" },
      { cardIndex: 0 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not your turn");
  });

  test.each([
    ["negative", { cardIndex: -1 }],
    ["too high", { cardIndex: 52 }],
    ["non-integer", { cardIndex: 1.5 }],
  ])("rejects an invalid card index (%s)", (_label, move) => {
    const res = reduce(
      state({ P1: [card("A", "H")], P2: [card("JOKER", "JOKER")] }),
      { role: "P1" },
      move as OldMaidMove,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid move");
  });

  test("rejects a card index that is valid by schema but absent from the fan", () => {
    const res = reduce(
      state({ P1: [card("A", "H")], P2: [card("JOKER", "JOKER")] }),
      { role: "P1" },
      { cardIndex: 1 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Card not available");
  });

  test("reduce does not mutate the input state", () => {
    const input = state({
      P1: [card("A", "H"), card("JOKER", "JOKER")],
      P2: [card("Q", "H"), card("K", "D")],
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    reduce(input, { role: "P1" }, { cardIndex: 0 });
    expect(input).toEqual(snapshot);
  });
});

describe("old-maid — drawing and outcomes", () => {
  test("drawing a matching card immediately discards the pair and wins", () => {
    const input = state({
      P1: [card("7", "H")],
      P2: [card("7", "S"), card("JOKER", "JOKER")],
    });
    const res = reduce(input, { role: "P1" }, { cardIndex: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.state.hands.P1).toEqual([]);
    expect(res.state.discardedPairs.at(-1)?.rank).toBe("7");
    expect(res.state.winnerRoles).toEqual(["P1"]);
    expect(res.state.loserRole).toBe("P2");
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRole: "P1",
      draw: false,
    });
  });

  test("drawing the Joker leaves the actor as the Old Maid when the opponent empties", () => {
    const input = state({
      P1: [card("Q", "H")],
      P2: [card("JOKER", "JOKER")],
    });
    const res = reduce(input, { role: "P1" }, { cardIndex: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.state.hands.P1.map((c) => c.rank)).toEqual(["Q", "JOKER"]);
    expect(res.state.winnerRoles).toEqual(["P2"]);
    expect(res.state.loserRole).toBe("P1");
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRole: "P2",
      draw: false,
    });
  });

  test("a non-matching draw passes the turn to the other active player", () => {
    const next = play(
      state({
        P1: [card("A", "H"), card("JOKER", "JOKER")],
        P2: [card("Q", "H"), card("K", "D")],
      }),
      "P1",
      0,
    );
    expect(next.currentTurn).toBe("P2");
    expect(next.lastDraw).toEqual({
      actorRole: "P1",
      fromRole: "P2",
      matchedRank: null,
    });
    expect(next.hands.P1.map((c) => c.rank)).toEqual(["A", "JOKER", "Q"]);
    expect(next.hands.P2.map((c) => c.rank)).toEqual(["K"]);
  });

  test("no move is accepted after the Old Maid is determined", () => {
    const terminal = {
      ...state({ P1: [card("JOKER", "JOKER")], P2: [] }),
      activeRoles: ["P1" as const],
      loserRole: "P1" as const,
      winnerRoles: ["P2" as const],
    };
    const res = reduce(terminal, { role: "P1" }, { cardIndex: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is not active");
  });
});
