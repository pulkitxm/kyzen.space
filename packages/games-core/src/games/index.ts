import type { GameDefinition } from "@gamelobby/shared/types";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES = [ticTacToeDefinition] satisfies GameDefinition[];
