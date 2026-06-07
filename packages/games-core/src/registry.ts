import { GAME_CATEGORIES } from "@gamelobby/shared/constants";
import type {
  GameCategoryDef,
  GameDefinition,
  GameEngine,
  GameMeta,
  GameType,
} from "@gamelobby/shared/types";
import { GAMES } from "./games";

const byType: Map<string, GameDefinition> = new Map(
  GAMES.map((def) => [def.meta.type, def]),
);

export function hasEngine(type: string): type is GameType {
  return byType.has(type);
}

export function getDefinition(type: string): GameDefinition {
  const def = byType.get(type);
  if (!def) throw new Error(`Unknown game type: ${type}`);
  return def;
}

export function getEngine(type: string): GameEngine<unknown, unknown> {
  return getDefinition(type).engine as GameEngine<unknown, unknown>;
}

export function listGameTypes(): GameType[] {
  return GAMES.map((def) => def.meta.type);
}

export function listDefinitions(): GameDefinition[] {
  return GAMES;
}

export function listGameMeta(): GameMeta[] {
  return GAMES.map((def) => def.meta);
}

export function getCategoryGroups(): {
  category: GameCategoryDef;
  games: GameMeta[];
}[] {
  return Object.values(GAME_CATEGORIES)
    .map((category) => ({
      category,
      games: GAMES.filter((def) => def.meta.categoryId === category.id).map(
        (def) => def.meta,
      ),
    }))
    .filter((group) => group.games.length > 0);
}
