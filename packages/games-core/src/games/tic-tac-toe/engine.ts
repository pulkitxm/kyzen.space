import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import {
  type Cell,
  type GameEngine,
  type Mark,
  type Outcome,
  type ReduceResult,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeMoveSchema,
} from "@kyzen/shared/types";

const BOARD_SIZE = 9;

export const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const satisfies readonly (readonly [number, number, number])[];

export function emptyBoard(): Cell[] {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

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
  if (winner)
    return { status: "completed", winnerRoles: [winner], draw: false };
  if (isBoardFull(state.board))
    return { status: "completed", winnerRoles: [], draw: true };
  return { status: "active" };
}

export function isTerminal(state: TicTacToeState): boolean {
  return outcomeFor(state).status === "completed";
}

export const ticTacToeEngine: GameEngine<TicTacToeState, TicTacToeMove> = {
  type: TIC_TAC_TOE,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,

  roleForSeat(index): Mark {
    return index % 2 === 0 ? "X" : "O";
  },

  createInitialState(): TicTacToeState {
    return { board: emptyBoard(), currentTurn: "X" };
  },

  reduce(state, ctx, input): ReduceResult<TicTacToeState> {
    if (isTerminal(state)) {
      return { ok: false, error: "Game is not active" };
    }
    if (!isMark(ctx.role)) {
      return { ok: false, error: "Not a player in this game" };
    }
    if (state.currentTurn !== ctx.role) {
      return { ok: false, error: "Not your turn" };
    }
    const parsed = ticTacToeMoveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid move" };
    }
    const { row, col } = parsed.data;
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

  autoMove(state): TicTacToeMove {
    const empties: number[] = [];
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] === null) empties.push(i);
    }
    const pick = empties[Math.floor(Math.random() * empties.length)] ?? 0;
    return { row: Math.floor(pick / 3), col: pick % 3 };
  },

  currentRole(state): string | null {
    return isTerminal(state) ? null : state.currentTurn;
  },
};
