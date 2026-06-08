import { GAME_CATEGORIES, TIC_TAC_TOE } from "@gamelobby/shared/constants";
import type { GameMeta } from "@gamelobby/shared/types";

export const ticTacToeMeta: GameMeta = {
  type: TIC_TAC_TOE,
  name: "Tic-tac-toe",
  description: "Classic 3×3 board. Get three in a row to win.",
  categoryId: GAME_CATEGORIES.BOARD_CLASSICS.id,
  coverImage: "/games/tic-tac-toe-cover.png",
};
