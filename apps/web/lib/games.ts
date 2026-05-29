export interface GameCategoryDef {
  id: string;
  label: string;
}

export const GAME_CATEGORIES: GameCategoryDef[] = [
  { id: "board-classics", label: "Board classics" },
  { id: "party", label: "Party" },
];

export interface GameEntry {
  id: string;
  name: string;
  description: string;
  href: string;
  categoryId: string;
  coverImage?: string;
}

export const GAMES: GameEntry[] = [
  {
    id: "tic-tac-toe",
    name: "Tic-tac-toe",
    description: "Classic 3×3 board. Get three in a row to win.",
    href: "/games/tic-tac-toe",
    categoryId: "board-classics",
    coverImage: "/games/tic-tac-toe-cover.png",
  },
];

export function getCategoryGroups(): {
  category: GameCategoryDef;
  games: GameEntry[];
}[] {
  return GAME_CATEGORIES.map((category) => ({
    category,
    games: GAMES.filter((g) => g.categoryId === category.id),
  })).filter((g) => g.games.length > 0);
}
