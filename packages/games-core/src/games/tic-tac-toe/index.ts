import type { GameDefinition } from "../../definition";
import { ticTacToeEngine } from "./engine";
import { ticTacToeMeta } from "./meta";
import {
  type TicTacToeConfig,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeConfigSchema,
  ticTacToeMoveSchema,
  ticTacToeStateSchema,
} from "./schemas";

export const ticTacToeDefinition: GameDefinition<
  TicTacToeState,
  TicTacToeMove,
  TicTacToeConfig
> = {
  meta: ticTacToeMeta,
  engine: ticTacToeEngine,
  stateSchema: ticTacToeStateSchema,
  moveSchema: ticTacToeMoveSchema,
  configSchema: ticTacToeConfigSchema,
  configFields: [],
};
