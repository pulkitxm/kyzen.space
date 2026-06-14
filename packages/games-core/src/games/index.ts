import type { GameDefinition } from "@kyzen/shared/types";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [ticTacToeDefinition] satisfies GameDefinition[];
