import { z } from "zod";

export const TIC_TAC_TOE = "tic-tac-toe";

/** A single board cell: a placed mark or empty. */
export const cellSchema = z.enum(["X", "O"]).nullable();
export type Cell = z.infer<typeof cellSchema>;

/** A player's mark / role. */
export const markSchema = z.enum(["X", "O"]);
export type Mark = z.infer<typeof markSchema>;

/** Strict game state: exactly 9 cells + whose turn it is. */
export const ticTacToeStateSchema = z
  .object({
    board: z.array(cellSchema).length(9),
    currentTurn: markSchema,
  })
  .strict();
export type TicTacToeState = z.infer<typeof ticTacToeStateSchema>;

/** Strict move: integer row/col within the 3×3 grid. */
export const ticTacToeMoveSchema = z
  .object({
    row: z.number().int().min(0).max(2),
    col: z.number().int().min(0).max(2),
  })
  .strict();
export type TicTacToeMove = z.infer<typeof ticTacToeMoveSchema>;

/** No setup options for tic-tac-toe. */
export const ticTacToeConfigSchema = z.object({}).strict();
export type TicTacToeConfig = z.infer<typeof ticTacToeConfigSchema>;
