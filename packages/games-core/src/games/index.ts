import type { GameDefinition } from "../definition";
import { ticTacToeDefinition } from "./tic-tac-toe";

/**
 * THE single source of truth for the game catalog. Every generic part of the
 * platform (registry lookups, server driver, DB guardrails, web lobby, the
 * conformance test suite) derives from this array. Add a game by appending its
 * `GameDefinition` here — nothing else in the platform needs to change.
 */
export const GAMES: GameDefinition[] = [ticTacToeDefinition];
