import type { GameEngine } from "./engine";
import { ticTacToeEngine, TIC_TAC_TOE } from "./games/tic-tac-toe";

/** All registered game engines, keyed by `type`. Add new games here. */
const engines: Record<string, GameEngine<unknown, unknown>> = {
  [TIC_TAC_TOE]: ticTacToeEngine as GameEngine<unknown, unknown>,
};

/** True if a game type has a registered engine. */
export function hasEngine(type: string): boolean {
  return type in engines;
}

/** Resolve an engine by game type. Throws on unknown type. */
export function getEngine(type: string): GameEngine<unknown, unknown> {
  const engine = engines[type];
  if (!engine) throw new Error(`Unknown game type: ${type}`);
  return engine;
}

/** List all registered game types. */
export function listGameTypes(): string[] {
  return Object.keys(engines);
}
