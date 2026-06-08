import type { GAME_CATEGORIES } from "../../constants/categories";

export default interface GameCategoryDef {
  id: string;
  label: string;
}

export type GameCategoryId =
  (typeof GAME_CATEGORIES)[keyof typeof GAME_CATEGORIES]["id"];
