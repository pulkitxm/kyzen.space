import { describe, expect, test } from "bun:test";
import type { Cell } from "@kyzen/shared/types";
import {
  findWinningLine,
  WINNING_LINES,
} from "../src/games/tic-tac-toe/winning-line";

function board(cells: string): Cell[] {
  return cells.split("").map((c) => (c === "X" ? "X" : c === "O" ? "O" : null));
}

describe("findWinningLine", () => {
  test("returns null for an empty board", () => {
    expect(findWinningLine(board("........."))).toBeNull();
  });

  test("returns null when there is no completed line", () => {
    expect(findWinningLine(board("XOX.O.X.O"))).toBeNull();
  });

  test("detects each winning line for X", () => {
    for (const [a, b, c] of WINNING_LINES) {
      const cells: Cell[] = Array.from({ length: 9 }, () => null);
      cells[a] = "X";
      cells[b] = "X";
      cells[c] = "X";
      expect(findWinningLine(cells)).toEqual([a, b, c]);
    }
  });

  test("detects a winning line for O", () => {
    expect(findWinningLine(board("OOOXX...."))).toEqual([0, 1, 2]);
  });

  test("does not treat three different-mark cells as a win", () => {
    expect(findWinningLine(board("XOX......"))).toBeNull();
  });

  test("returns the first winning line when scanning", () => {
    expect(findWinningLine(board("XXXXXX..."))).toEqual([0, 1, 2]);
  });
});
