import { getDefinition, hasEngine } from "@kyzen/games-core";

export function gameMusicSource(gameType: string): string | null {
  return hasEngine(gameType)
    ? (getDefinition(gameType).meta.backgroundMusic ?? null)
    : null;
}
