import type { GameDefinition } from "@kyzen/shared/types";
import { tankArenaDefinition } from "./tank-arena";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [
  ticTacToeDefinition,
  tankArenaDefinition,
] satisfies GameDefinition[];
