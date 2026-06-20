import type { GameDefinition } from "@kyzen/shared/types";
import { monopolyDefinition } from "./monopoly";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [
  ticTacToeDefinition,
  monopolyDefinition,
] satisfies GameDefinition[];
