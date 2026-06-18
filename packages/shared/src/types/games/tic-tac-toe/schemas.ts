import { z } from "zod";
import { TIC_TAC_TOE_DEFAULT_BEST_OF } from "../../../constants/games";

const cellSchema = z.enum(["X", "O"]).nullable();
export type Cell = z.infer<typeof cellSchema>;

const markSchema = z.enum(["X", "O"]);
export type Mark = z.infer<typeof markSchema>;

export const ticTacToeStateSchema = z
  .object({
    board: z.array(cellSchema).length(9),
    currentTurn: markSchema,
  })
  .strict();
export type TicTacToeState = z.infer<typeof ticTacToeStateSchema>;

export const ticTacToeMoveSchema = z
  .object({
    row: z.number().int().min(0).max(2),
    col: z.number().int().min(0).max(2),
  })
  .strict();
export type TicTacToeMove = z.infer<typeof ticTacToeMoveSchema>;

export const ticTacToeBestOfSchema = z.union([
  z.literal(1),
  z.literal(3),
  z.literal(5),
]);

export const ticTacToeConfigSchema = z
  .object({
    bestOf: ticTacToeBestOfSchema.default(TIC_TAC_TOE_DEFAULT_BEST_OF),
  })
  .strict();
export type TicTacToeConfig = z.infer<typeof ticTacToeConfigSchema>;
