export interface GameCategoryDef {
  id: string;
  label: string;
}

/** Display groupings for the games index. Order here is the display order. */
export const GAME_CATEGORIES: GameCategoryDef[] = [
  { id: "board-classics", label: "Board classics" },
  { id: "party", label: "Party" },
];
