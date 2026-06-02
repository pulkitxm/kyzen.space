import type { GameMeta } from "../../definition";
import { TIC_TAC_TOE } from "../../game-types";

export const ticTacToeMeta: GameMeta = {
  type: TIC_TAC_TOE,
  name: "Tic-tac-toe",
  description: "Classic 3×3 board. Get three in a row to win.",
  categoryId: "board-classics",
  coverImage: "/games/tic-tac-toe-cover.png",
};
