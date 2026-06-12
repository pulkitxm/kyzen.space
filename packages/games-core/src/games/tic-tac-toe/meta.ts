import { GAME_CATEGORIES, TIC_TAC_TOE } from "@gamelobby/shared/constants";
import type { GameMeta } from "@gamelobby/shared/types";

export const ticTacToeMeta: GameMeta = {
  type: TIC_TAC_TOE,
  name: "Tic-tac-toe",
  description: "Classic 3×3 board. Line up three in a row to win.",
  categoryId: GAME_CATEGORIES.BOARD_CLASSICS.id,
  coverImage: "/games/tic-tac-toe-cover.png",
  tutorialVideo: "/games/tic-tac-toe-tutorial.mp4",
  howToPlay: [
    "You play as X or O. X always makes the first move.",
    "On your turn, tap any empty cell to place your mark.",
    "Line up three of your marks in a row, column, or diagonal to win.",
    "If all nine cells fill with no line of three, the game is a draw.",
  ],
};
