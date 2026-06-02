import { GAME_CATEGORIES, type GameCategoryDef } from "./categories";
import type { GameDefinition, GameMeta } from "./definition";
import type { GameEngine } from "./engine";
import { GAMES } from "./games";

const byType: Map<string, GameDefinition> = new Map(
  GAMES.map((def) => [def.meta.type, def]),
);

export function hasEngine(type: string): boolean {
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

export function listGameTypes(): string[] {
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
  return GAME_CATEGORIES.map((category) => ({
    category,
    games: GAMES.filter((def) => def.meta.categoryId === category.id).map(
      (def) => def.meta,
    ),
  })).filter((group) => group.games.length > 0);
}
