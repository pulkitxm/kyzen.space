import type { GameEngine, Outcome, ReduceResult, Seat } from "../engine";

export const TIC_TAC_TOE = "tic-tac-toe";

export type Cell = "X" | "O" | null;
export type Mark = "X" | "O";
export type TicTacToeState = { board: Cell[]; currentTurn: Mark };
export type TicTacToeMove = { row: number; col: number };

const BOARD_SIZE = 9;

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Cell[] {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

/** Returns the winning mark if a line is complete, else null. Pure. */
export function lineWinner(board: Cell[]): Mark | null {
  for (const [a, b, c] of WIN_LINES) {
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return v;
  }
  return null;
}

export function isBoardFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

function isMark(role: string): role is Mark {
  return role === "X" || role === "O";
}

function outcomeFor(state: TicTacToeState): Outcome {
  const winner = lineWinner(state.board);
  if (winner) return { status: "completed", winnerRole: winner, draw: false };
  if (isBoardFull(state.board))
    return { status: "completed", winnerRole: null, draw: true };
  return { status: "active" };
}

/** True once the game has a winner or a full board. */
export function isTerminal(state: TicTacToeState): boolean {
  return outcomeFor(state).status === "completed";
}

export const ticTacToeEngine: GameEngine<TicTacToeState, TicTacToeMove> = {
  type: TIC_TAC_TOE,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,
  roles: ["X", "O"],

  createInitialState(_seats: Seat[]): TicTacToeState {
    return { board: emptyBoard(), currentTurn: "X" };
  },

  reduce(state, ctx, input): ReduceResult<TicTacToeState> {
    // Already over?
    if (isTerminal(state)) {
      return { ok: false, error: "Game is not active" };
    }
    // Valid role?
    if (!isMark(ctx.role)) {
      return { ok: false, error: "Not a player in this game" };
    }
    // Whose turn?
    if (state.currentTurn !== ctx.role) {
      return { ok: false, error: "Not your turn" };
    }
    // Valid coordinates?
    const { row, col } = input ?? ({} as TicTacToeMove);
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row > 2 ||
      col < 0 ||
      col > 2
    ) {
      return { ok: false, error: "Invalid move" };
    }
    const idx = row * 3 + col;
    if (state.board[idx] !== null) {
      return { ok: false, error: "Cell occupied" };
    }

    const board = [...state.board];
    board[idx] = ctx.role;
    const nextState: TicTacToeState = {
      board,
      currentTurn: ctx.role === "X" ? "O" : "X",
    };
    return { ok: true, state: nextState, outcome: outcomeFor(nextState) };
  },
};
