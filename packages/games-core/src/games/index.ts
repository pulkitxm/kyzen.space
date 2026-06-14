import type { GameDefinition } from "@kyzen/shared/types";
import { seaBattleDefinition } from "./sea-battle";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES: GameDefinition[] = [
  ticTacToeDefinition,
  seaBattleDefinition,
];
