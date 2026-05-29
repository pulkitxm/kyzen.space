import type { GameEngine } from "./engine";
import { TIC_TAC_TOE, ticTacToeEngine } from "./games/tic-tac-toe";

const engines: Record<string, GameEngine<unknown, unknown>> = {
  [TIC_TAC_TOE]: ticTacToeEngine as GameEngine<unknown, unknown>,
};

export function hasEngine(type: string): boolean {
  return type in engines;
}

export function getEngine(type: string): GameEngine<unknown, unknown> {
  const engine = engines[type];
  if (!engine) throw new Error(`Unknown game type: ${type}`);
  return engine;
}

export function listGameTypes(): string[] {
  return Object.keys(engines);
}
