import type GameCategoryDef from "../types/games/GameCategoryDef";

export const GAME_CATEGORIES = {
  BOARD_CLASSICS: { id: "board-classics", label: "Board classics" },
  PARTY: { id: "party", label: "Party" },
  ARENA: { id: "arena", label: "Arena" },
} as const satisfies Record<string, GameCategoryDef>;
