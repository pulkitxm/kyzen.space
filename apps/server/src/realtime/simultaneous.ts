import type { GamePlayer } from "@kyzen/database";
import { type GameEngine, isBotId } from "@kyzen/shared/types";

type Engine = GameEngine<unknown, unknown>;

export function actingRoles(engine: Engine, state: unknown): string[] {
  if (engine.mode === "simultaneous") return engine.pendingRoles?.(state) ?? [];
  const role = engine.currentRole?.(state) ?? null;
  return role ? [role] : [];
}

export function roundClock(
  engine: Engine,
  state: unknown,
): { key: string; limitMs: number } | null {
  if (!engine.roundOf || !engine.roundTimeMs) return null;
  return {
    key: `round:${engine.roundOf(state)}`,
    limitMs: engine.roundTimeMs(state),
  };
}

export function pendingPlayers(
  players: GamePlayer[],
  roles: string[],
): { humans: GamePlayer[]; bots: GamePlayer[] } {
  const pending = players.filter((player) => roles.includes(player.role));
  return {
    humans: pending.filter((player) => !isBotId(player.userId)),
    bots: pending.filter((player) => isBotId(player.userId)),
  };
}
