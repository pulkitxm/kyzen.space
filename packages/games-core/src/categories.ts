export interface GameCategoryDef {
  id: string;
  label: string;
}

export const GAME_CATEGORIES: GameCategoryDef[] = [
  { id: "board-classics", label: "Board classics" },
  { id: "party", label: "Party" },
];
