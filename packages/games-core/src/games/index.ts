import type { GameDefinition } from "@gamelobby/shared/types";
import { oldMaidDefinition } from "./playingCards/old-maid";
import { ticTacToeDefinition } from "./tic-tac-toe";

export const GAMES: GameDefinition[] = [ticTacToeDefinition, oldMaidDefinition];
