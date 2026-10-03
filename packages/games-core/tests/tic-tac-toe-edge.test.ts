import { describe, expect, test } from "bun:test";
import type {
  Cell,
  Mark,
  Outcome,
  Seat,
  TicTacToeMove,
  TicTacToeState,
} from "@kyzen/shared/types";
import {
  emptyBoard,
  isBoardFull,
  isTerminal,
  lineWinner,
  ticTacToeEngine,
  WIN_LINES,
} from "../src/index";

if (!ticTacToeEngine.reduce) {
  throw new Error("tic-tac-toe engine must define reduce");
}
const reduce: NonNullable<typeof ticTacToeEngine.reduce> =
  ticTacToeEngine.reduce;

function boardOf(cells: Partial<Record<number, Mark>>): Cell[] {
  const board = emptyBoard();
  for (const [idx, mark] of Object.entries(cells)) {
    board[Number(idx)] = mark ?? null;
  }
  return board;
}

function stateOf(
  cells: Partial<Record<number, Mark>>,
  turn: Mark,
): TicTacToeState {
  return { board: boardOf(cells), currentTurn: turn };
}

describe("WIN_LINES table", () => {
  test("is exactly the 8 canonical triples", () => {
    expect(WIN_LINES.length).toBe(8);
    expect(WIN_LINES.map((line) => [...line])).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ]);
  });

  test("contains no duplicate lines", () => {
    const keys = WIN_LINES.map((line) => line.join(","));
    expect(new Set(keys).size).toBe(WIN_LINES.length);
  });

  test("every index is a valid board cell and each line is three distinct cells", () => {
    for (const line of WIN_LINES) {
      expect(line.length).toBe(3);
      expect(new Set(line).size).toBe(3);
      for (const idx of line) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("lineWinner priority and false positives", () => {
  test("returns the actual mark, not a boolean", () => {
    expect(lineWinner(boardOf({ 0: "X", 1: "X", 2: "X" }))).toBe("X");
    expect(lineWinner(boardOf({ 0: "O", 1: "O", 2: "O" }))).toBe("O");
  });

  test("when both X and O hold a line, returns the first line in WIN_LINES order (X here)", () => {
    const board = boardOf({
      0: "X",
      1: "X",
      2: "X",
      3: "O",
      4: "O",
      5: "O",
    });
    expect(lineWinner(board)).toBe("X");
  });

  test("does not falsely win on two marks plus a null in a line", () => {
    expect(lineWinner(boardOf({ 0: "X", 1: "X" }))).toBeNull();
    expect(lineWinner(boardOf({ 0: "X", 2: "X" }))).toBeNull();
  });

  test("does not falsely win on a line of three with a mismatched mark", () => {
    expect(lineWinner(boardOf({ 0: "X", 1: "X", 2: "O" }))).toBeNull();
    expect(lineWinner(boardOf({ 0: "X", 1: "O", 2: "X" }))).toBeNull();
  });

  test("detects a win on the anti-diagonal specifically", () => {
    expect(lineWinner(boardOf({ 2: "O", 4: "O", 6: "O" }))).toBe("O");
  });
});

describe("isBoardFull and isTerminal boundaries", () => {
  test("isBoardFull is false when a single interior cell remains null", () => {
    const board = emptyBoard().fill("X");
    board[4] = null;
    expect(isBoardFull(board)).toBe(false);
  });

  test("isTerminal is true for a win and for a full no-line board", () => {
    expect(isTerminal(stateOf({ 0: "X", 1: "X", 2: "X" }, "O"))).toBe(true);
    const full = stateOf(
      {
        0: "X",
        1: "O",
        2: "X",
        3: "X",
        4: "O",
        5: "O",
        6: "O",
        7: "X",
        8: "X",
      },
      "X",
    );
    expect(isBoardFull(full.board)).toBe(true);
    expect(lineWinner(full.board)).toBeNull();
    expect(isTerminal(full)).toBe(true);
  });

  test("isTerminal is false on an empty and on a partial non-winning board", () => {
    expect(isTerminal(stateOf({}, "X"))).toBe(false);
    expect(isTerminal(stateOf({ 0: "X", 4: "O" }, "X"))).toBe(false);
  });
});

describe("reduce guard ordering (priority of failure branches)", () => {
  test("terminal check fires before the role check", () => {
    const res = reduce(
      stateOf({ 0: "X", 1: "X", 2: "X" }, "O"),
      { role: "Z" },
      { row: 1, col: 0 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is not active");
  });

  test("terminal check fires before the turn check", () => {
    const res = reduce(
      stateOf({ 0: "X", 1: "X", 2: "X" }, "O"),
      { role: "X" },
      { row: 1, col: 0 },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is not active");
  });

  test("role check fires before the turn check", () => {
    const res = reduce(stateOf({}, "X"), { role: "Z" }, { row: 0, col: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not a player in this game");
  });

  test("turn check fires before the move-schema parse", () => {
    const res = reduce(stateOf({}, "X"), { role: "O" }, {
      row: 9,
      col: 9,
    } as TicTacToeMove);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not your turn");
  });

  test("move-schema parse fires before the occupancy check", () => {
    const res = reduce(stateOf({ 4: "X" }, "O"), { role: "O" }, {
      row: 9,
      col: 9,
    } as TicTacToeMove);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid move");
  });
});

describe("reduce move-schema strictness inside the engine", () => {
  test("rejects a move carrying an extra key", () => {
    const res = reduce(stateOf({}, "X"), { role: "X" }, {
      row: 0,
      col: 0,
      isAdmin: true,
    } as unknown as TicTacToeMove);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid move");
  });

  test("rejects a move missing col", () => {
    const res = reduce(stateOf({}, "X"), { role: "X" }, {
      row: 0,
    } as unknown as TicTacToeMove);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid move");
  });

  test("rejects null and non-object move payloads", () => {
    for (const bad of [null, undefined, "x", 5, []]) {
      const res = reduce(
        stateOf({}, "X"),
        { role: "X" },
        bad as unknown as TicTacToeMove,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("Invalid move");
    }
  });
});

describe("reduce purity and determinism", () => {
  test("returns a fresh board array distinct from the input board", () => {
    const state = stateOf({}, "X");
    const res = reduce(state, { role: "X" }, { row: 0, col: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.state.board).not.toBe(state.board);
    expect(res.state).not.toBe(state);
  });

  test("does not mutate the input board on a successful move", () => {
    const state = stateOf({}, "X");
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, { role: "X" }, { row: 1, col: 2 });
    expect(state).toEqual(snapshot);
  });

  test("does not mutate the input board on a rejected occupied move", () => {
    const state = stateOf({ 4: "X" }, "O");
    const snapshot = JSON.parse(JSON.stringify(state));
    const res = reduce(state, { role: "O" }, { row: 1, col: 1 });
    expect(res.ok).toBe(false);
    expect(state).toEqual(snapshot);
  });

  test("is deterministic: same inputs yield equal results across calls", () => {
    const a = reduce(stateOf({}, "X"), { role: "X" }, { row: 2, col: 1 });
    const b = reduce(stateOf({}, "X"), { role: "X" }, { row: 2, col: 1 });
    expect(a).toEqual(b);
  });

  test("two reduce calls return distinct board references (no shared mutable state)", () => {
    const a = reduce(stateOf({}, "X"), { role: "X" }, { row: 0, col: 0 });
    const b = reduce(stateOf({}, "X"), { role: "X" }, { row: 0, col: 0 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("expected ok results");
    expect(a.state.board).not.toBe(b.state.board);
  });
});

describe("reduce outcome over the seam between active and completed", () => {
  test("a winning move that does NOT fill the board completes as a win with draw false", () => {
    const state = stateOf({ 0: "X", 1: "X", 3: "O", 4: "O" }, "X");
    const res = reduce(state, { role: "X" }, { row: 0, col: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(isBoardFull(res.state.board)).toBe(false);
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRoles: ["X"],
      draw: false,
    });
  });

  test("the move that fills the last cell without a line completes as a draw", () => {
    const state = stateOf(
      { 0: "X", 1: "O", 2: "X", 3: "X", 4: "O", 5: "O", 6: "O", 7: "X" },
      "X",
    );
    const res = reduce(state, { role: "X" }, { row: 2, col: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(isBoardFull(res.state.board)).toBe(true);
    expect(lineWinner(res.state.board)).toBeNull();
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRoles: [],
      draw: true,
    });
  });

  test("the last cell that simultaneously fills the board and completes a line is a win, not a draw", () => {
    const state = stateOf(
      { 0: "X", 1: "O", 2: "O", 3: "O", 4: "X", 5: "X", 6: "X", 7: "O" },
      "X",
    );
    const res = reduce(state, { role: "X" }, { row: 2, col: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(isBoardFull(res.state.board)).toBe(true);
    expect(res.outcome.status).toBe("completed");
    if (res.outcome.status !== "completed")
      throw new Error("expected completed");
    expect(res.outcome.draw).toBe(false);
    expect(res.outcome.winnerRoles).toEqual(["X"]);
  });
});

describe("reduce post-terminal rejection", () => {
  test("no move accepted after a draw", () => {
    const drawn = stateOf(
      {
        0: "X",
        1: "O",
        2: "X",
        3: "X",
        4: "O",
        5: "O",
        6: "O",
        7: "X",
        8: "X",
      },
      "O",
    );
    expect(isTerminal(drawn)).toBe(true);
    const res = reduce(drawn, { role: "O" }, { row: 0, col: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is not active");
  });

  test("the correct next player is still rejected once the game is won", () => {
    const won = stateOf({ 0: "X", 1: "X", 2: "X" }, "O");
    const res = reduce(won, { role: "O" }, { row: 4, col: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Game is not active");
  });
});

const SETUP = { config: {}, seed: 7 };

function seat(role: string, team = role): Seat {
  return { role, team, bot: null };
}

describe("createInitialState ignores seat arrangement, teams, bots, and seed", () => {
  test("yields X-to-move on an empty board regardless of the seats passed", () => {
    const seatVariants: Seat[][] = [
      [],
      [seat("X"), seat("O")],
      [seat("O"), seat("X")],
      [seat("anything", "A")],
      [seat("X", "A"), { role: "O", team: "A", bot: "hard" }],
    ];
    for (const seats of seatVariants) {
      for (const seed of [0, 1, 2 ** 31 - 1]) {
        const s = ticTacToeEngine.createInitialState(seats, { ...SETUP, seed });
        expect(s.currentTurn).toBe("X");
        expect(s.board).toEqual(emptyBoard());
      }
    }
  });

  test("a mutation of one created state never leaks into the next", () => {
    const first = ticTacToeEngine.createInitialState([], SETUP);
    first.board[0] = "X";
    (first as TicTacToeState).currentTurn = "O";
    const second = ticTacToeEngine.createInitialState([], SETUP);
    expect(second.board[0]).toBeNull();
    expect(second.currentTurn).toBe("X");
  });
});

describe("engine static descriptors", () => {
  test("declares two fixed seats with distinct ordered roles", () => {
    expect(ticTacToeEngine.minPlayers).toBe(2);
    expect(ticTacToeEngine.maxPlayers).toBe(2);
    expect([0, 1].map((index) => ticTacToeEngine.roleForSeat(index))).toEqual([
      "X",
      "O",
    ]);
    expect(ticTacToeEngine.mode).toBe("turn-based");
  });

  test("is a plain turn-based engine without lobby, bot, or round hooks", () => {
    expect(ticTacToeEngine.lobby).toBeUndefined();
    expect(ticTacToeEngine.botMove).toBeUndefined();
    expect(ticTacToeEngine.pendingRoles).toBeUndefined();
    expect(ticTacToeEngine.roundOf).toBeUndefined();
    expect(ticTacToeEngine.publicState).toBeUndefined();
    expect(ticTacToeEngine.publicMove).toBeUndefined();
    expect(ticTacToeEngine.playerCount).toBeUndefined();
  });

  test("does not implement the realtime step handler", () => {
    expect(ticTacToeEngine.step).toBeUndefined();
    expect(ticTacToeEngine.tickRate).toBeUndefined();
  });
});

describe("outcome typing sanity", () => {
  test("an active outcome carries only the status discriminant", () => {
    const res = reduce(stateOf({}, "X"), { role: "X" }, { row: 1, col: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    const outcome: Outcome = res.outcome;
    expect(outcome).toEqual({ status: "active" });
  });
});
