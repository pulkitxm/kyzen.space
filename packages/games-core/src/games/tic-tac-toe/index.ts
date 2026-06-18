import {
  type GameDefinition,
  type TicTacToeConfig,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeConfigSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "@kyzen/shared/types";
import type { ZodType } from "zod";
import { ticTacToeEngine } from "./engine";
import { ticTacToeMeta } from "./meta";

export const ticTacToeDefinition: GameDefinition<
  TicTacToeState,
  TicTacToeMove,
  TicTacToeConfig
> = {
  meta: ticTacToeMeta,
  engine: ticTacToeEngine,
  stateSchema: ticTacToeStateSchema,
  moveSchema: ticTacToeMoveSchema,
  configSchema: ticTacToeConfigSchema as ZodType<TicTacToeConfig>,
  configFields: [
    {
      key: "bestOf",
      label: "Match format",
      type: "select",
      default: 3,
      options: [
        { value: "1", label: "Single game" },
        { value: "3", label: "Best of 3" },
        { value: "5", label: "Best of 5" },
      ],
    },
  ],
};
