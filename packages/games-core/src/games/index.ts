import type { GameDefinition } from "@gamelobby/shared/types";
import { monopolyDefinition } from "./monopoly";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [
  ticTacToeDefinition,
  monopolyDefinition,
] satisfies GameDefinition[];
