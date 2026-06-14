import { GAME_CATEGORIES, SEA_BATTLE } from "@kyzen/shared/constants";
import type { GameMeta } from "@kyzen/shared/types";

export const seaBattleMeta: GameMeta = {
  type: SEA_BATTLE,
  name: "Sea Battle",
  description:
    "Hide your fleet on a 10x10 grid, then sink the enemy before they sink you.",
  categoryId: GAME_CATEGORIES.BOARD_CLASSICS.id,
  coverImage: "/games/sea-battle-cover.svg",
  howToPlay: [
    "Arrange your five ships on your 10x10 grid, or tap Randomize for a legal layout.",
    "Ships are straight lines and may touch, but never overlap or leave the board.",
    "Press Ready once your fleet is set; the battle starts when both captains are ready.",
    "On your turn, fire at one cell of the enemy grid - a hit or a miss ends your turn.",
    "Hit every cell of a ship to sink it; sink the whole enemy fleet to win.",
  ],
};
