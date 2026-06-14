import { describe, expect, test } from "bun:test";
import type { TicTacToeState } from "@kyzen/shared/types";
import { emptyBoard, ticTacToeEngine } from "../src/index";

const autoMove = ticTacToeEngine.autoMove;
const reduce = ticTacToeEngine.reduce;
if (!autoMove || !reduce) {
  throw new Error("tic-tac-toe engine must define autoMove and reduce");
}

describe("tic-tac-toe autoMove", () => {
  test("returns a legal move on an empty cell that reduce accepts", () => {
    const state: TicTacToeState = { board: emptyBoard(), currentTurn: "X" };
    const move = autoMove(state, "X");
    const idx = move.row * 3 + move.col;
    expect(state.board[idx]).toBeNull();
    const result = reduce(state, { role: "X" }, move);
    expect(result.ok).toBe(true);
  });

  test("only ever targets empty cells", () => {
    const board = emptyBoard();
    board[0] = "X";
    board[1] = "O";
    board[2] = "X";
    board[4] = "O";
    const state: TicTacToeState = { board, currentTurn: "O" };
    for (let i = 0; i < 30; i++) {
      const move = autoMove(state, "O");
      expect(board[move.row * 3 + move.col]).toBeNull();
    }
  });
});
