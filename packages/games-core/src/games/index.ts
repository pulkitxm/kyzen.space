import type { GameDefinition } from "@kyzen/shared/types";
import { carFootballDefinition } from "./car-football";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES: GameDefinition[] = [
  ticTacToeDefinition,
  carFootballDefinition,
];
