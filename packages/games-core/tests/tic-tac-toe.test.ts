import { describe, expect, test } from "bun:test";
import type {
  Mark,
  TicTacToeMove,
  TicTacToeState,
} from "@gamelobby/shared/types";
import {
  emptyBoard,
  getEngine,
  hasEngine,
  isBoardFull,
  isTerminal,
  lineWinner,
  listGameTypes,
  ticTacToeEngine,
} from "../src/index";

const SEATS = [{ role: "X" }, { role: "O" }];

if (!ticTacToeEngine.reduce) {
  throw new Error("tic-tac-toe engine must define reduce");
}
const reduce: NonNullable<typeof ticTacToeEngine.reduce> =
  ticTacToeEngine.reduce;

function initial(): TicTacToeState {
  return ticTacToeEngine.createInitialState(SEATS);
}

function play(
  state: TicTacToeState,
  role: Mark,
  row: number,
  col: number,
): TicTacToeState {
  const res = reduce(state, { role }, { row, col });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

function playSequence(moves: [Mark, number, number][]): TicTacToeState {
  let state = initial();
  for (const [role, row, col] of moves) state = play(state, role, row, col);
  return state;
}

describe("tic-tac-toe: initial state", () => {
  test("empty board, X to move", () => {
    const s = initial();
    expect(s.board).toEqual(emptyBoard());
    expect(s.board.every((c) => c === null)).toBe(true);
    expect(s.currentTurn).toBe("X");
  });

  test("createInitialState returns a fresh board each call", () => {
    const a = initial();
    a.board[0] = "X";
    const b = initial();
    expect(b.board[0]).toBeNull();
  });
});

describe("tic-tac-toe: turn & role enforcement", () => {
  test("O cannot move first", () => {
    const res = reduce(initial(), { role: "O" }, { row: 0, col: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not your turn");
  });

  test("same player cannot move twice in a row", () => {
    const afterX = play(initial(), "X", 0, 0);
    const res = reduce(afterX, { role: "X" }, { row: 1, col: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not your turn");
  });

  test("unknown role is rejected", () => {
    const res = reduce(initial(), { role: "Z" }, { row: 0, col: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Not a player in this game");
  });

  test("turn alternates after a valid move", () => {
    expect(initial().currentTurn).toBe("X");
    expect(play(initial(), "X", 0, 0).currentTurn).toBe("O");
  });
});

describe("tic-tac-toe: move validity", () => {
  test.each([
    ["row < 0", { row: -1, col: 0 }],
    ["row > 2", { row: 3, col: 0 }],
    ["col < 0", { row: 0, col: -1 }],
    ["col > 2", { row: 0, col: 3 }],
    ["non-integer row", { row: 1.5, col: 0 }],
  ])("rejects out-of-bounds move (%s)", (_label, move) => {
    const res = reduce(initial(), { role: "X" }, move as TicTacToeMove);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid move");
  });

  test("rejects an occupied cell", () => {
    const afterX = play(initial(), "X", 1, 1);
    const res = reduce(afterX, { role: "O" }, { row: 1, col: 1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Cell occupied");
  });

  test("reduce does not mutate the input state", () => {
    const s = initial();
    const snapshot = JSON.parse(JSON.stringify(s));
    reduce(s, { role: "X" }, { row: 0, col: 0 });
    expect(s).toEqual(snapshot);
  });
});

describe("tic-tac-toe: win detection (all 8 lines)", () => {
  const lineCases: { name: string; xCells: number[]; oCells: number[] }[] = [
    { name: "row 0", xCells: [0, 1, 2], oCells: [3, 4] },
    { name: "row 1", xCells: [3, 4, 5], oCells: [0, 1] },
    { name: "row 2", xCells: [6, 7, 8], oCells: [0, 1] },
    { name: "col 0", xCells: [0, 3, 6], oCells: [1, 2] },
    { name: "col 1", xCells: [1, 4, 7], oCells: [0, 2] },
    { name: "col 2", xCells: [2, 5, 8], oCells: [0, 1] },
    { name: "diag ↘", xCells: [0, 4, 8], oCells: [1, 2] },
    { name: "diag ↙", xCells: [2, 4, 6], oCells: [0, 1] },
  ];

  const toRC = (i: number): [number, number] => [Math.floor(i / 3), i % 3];

  test.each(lineCases)("X wins on $name", ({ xCells, oCells }) => {
    let state = initial();
    let outcome: import("@gamelobby/shared/types").Outcome | undefined;
    for (let i = 0; i < 3; i++) {
      const xCell = xCells[i];
      expect(xCell).toBeDefined();
      if (xCell === undefined) throw new Error("missing X cell");
      const [xr, xc] = toRC(xCell);
      const r = reduce(state, { role: "X" }, { row: xr, col: xc });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      outcome = r.outcome;
      if (i < 2) {
        const oCell = oCells[i];
        expect(oCell).toBeDefined();
        if (oCell === undefined) throw new Error("missing O cell");
        const [or, oc] = toRC(oCell);
        state = play(state, "O", or, oc);
      }
    }
    expect(outcome).toEqual({
      status: "completed",
      winnerRole: "X",
      draw: false,
    });
    expect(lineWinner(state.board)).toBe("X");
  });

  test("O can also win", () => {
    const state = playSequence([
      ["X", 0, 0],
      ["O", 1, 0],
      ["X", 0, 1],
      ["O", 1, 1],
      ["X", 2, 2],
    ]);
    const res = reduce(state, { role: "O" }, { row: 1, col: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRole: "O",
      draw: false,
    });
  });

  test("not flagged completed before the line is finished", () => {
    const state = playSequence([
      ["X", 0, 0],
      ["O", 1, 0],
    ]);
    expect(isTerminal(state)).toBe(false);
  });
});

describe("tic-tac-toe: draw", () => {
  test("full board with no line is a draw", () => {
    const state = playSequence([
      ["X", 0, 0],
      ["O", 0, 1],
      ["X", 0, 2],
      ["O", 1, 2],
      ["X", 1, 0],
      ["O", 2, 0],
      ["X", 1, 1],
      ["O", 2, 2],
    ]);
    const res = reduce(state, { role: "X" }, { row: 2, col: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(isBoardFull(res.state.board)).toBe(true);
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRole: null,
      draw: true,
    });
  });
});

describe("tic-tac-toe: winner takes priority over a full board", () => {
  test("a final move that fills the board AND completes a line is a win, not a draw", () => {
    const state = playSequence([
      ["X", 0, 0],
      ["O", 0, 2],
      ["X", 0, 1],
      ["O", 1, 2],
      ["X", 1, 0],
      ["O", 2, 0],
      ["X", 1, 1],
      ["O", 2, 1],
    ]);
    const res = reduce(state, { role: "X" }, { row: 2, col: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(isBoardFull(res.state.board)).toBe(true);
    expect(lineWinner(res.state.board)).toBe("X");
    expect(res.outcome).toEqual({
      status: "completed",
      winnerRole: "X",
      draw: false,
    });
  });
});

describe("tic-tac-toe: board helpers", () => {
  test("lineWinner is null on an empty and on a non-winning board", () => {
    expect(lineWinner(emptyBoard())).toBeNull();
    const board = emptyBoard();
    board[0] = "X";
    board[1] = "O";
    expect(lineWinner(board)).toBeNull();
  });

  test("isBoardFull is false for empty/partial boards and true when filled", () => {
    expect(isBoardFull(emptyBoard())).toBe(false);
    const partial = emptyBoard();
    partial[0] = "X";
    expect(isBoardFull(partial)).toBe(false);
    expect(isBoardFull(emptyBoard().fill("X"))).toBe(true);
  });
});

describe("tic-tac-toe: post-game", () => {
  test("no move accepted after a win", () => {
    let state = playSequence([
      ["X", 0, 0],
      ["O", 1, 0],
      ["X", 0, 1],
      ["O", 1, 1],
    ]);
    const winning = reduce(state, { role: "X" }, { row: 0, col: 2 });
    expect(winning.ok).toBe(true);
    if (!winning.ok) throw new Error(winning.error);
    state = winning.state;
    const after = reduce(state, { role: "O" }, { row: 2, col: 2 });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.error).toBe("Game is not active");
  });
});

describe("tic-tac-toe: full playthroughs", () => {
  test("X-win playthrough tracks state at every step", () => {
    let state = initial();
    const seq: [Mark, number, number][] = [
      ["X", 1, 1],
      ["O", 0, 0],
      ["X", 2, 2],
      ["O", 0, 1],
      ["X", 0, 2],
    ];
    let lastOutcome: import("@gamelobby/shared/types").Outcome | undefined;
    let placed = 0;
    for (const [role, row, col] of seq) {
      const res = reduce(state, { role }, { row, col });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(res.error);
      state = res.state;
      lastOutcome = res.outcome;
      placed += 1;
      expect(state.board.filter((c) => c !== null).length).toBe(placed);
    }
    expect(lastOutcome).toEqual({ status: "active" });
  });

  test("a real X win sequence ends completed", () => {
    let state = initial();
    const seq: [Mark, number, number][] = [
      ["X", 0, 0],
      ["O", 1, 0],
      ["X", 0, 1],
      ["O", 1, 1],
      ["X", 0, 2],
    ];
    let outcome: import("@gamelobby/shared/types").Outcome | undefined;
    for (const [role, row, col] of seq) {
      const res = reduce(state, { role }, { row, col });
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(res.error);
      state = res.state;
      outcome = res.outcome;
    }
    expect(outcome).toEqual({
      status: "completed",
      winnerRole: "X",
      draw: false,
    });
  });
});

describe("registry", () => {
  test("resolves the tic-tac-toe engine", () => {
    expect(getEngine("tic-tac-toe")).toBe(
      ticTacToeEngine as unknown as ReturnType<typeof getEngine>,
    );
    expect(hasEngine("tic-tac-toe")).toBe(true);
    expect(listGameTypes()).toContain("tic-tac-toe");
  });

  test("throws on unknown game type", () => {
    expect(() => getEngine("chess")).toThrow("Unknown game type: chess");
    expect(hasEngine("chess")).toBe(false);
  });
});
