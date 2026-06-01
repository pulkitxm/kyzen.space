import { type ComponentType, lazy } from "react";
import type { GameClientProps } from "./types";

/**
 * gameType → client component. Lazy so each game's UI is code-split and only
 * loaded when actually played; `React.lazy` keeps this framework-agnostic (no
 * Next dependency) — render the result inside a `<Suspense>` on the client.
 * Keyed by the same `type` strings as games-core's `GAMES`. Add a new game's
 * component here (the only place a new game touches the client package).
 */
const REGISTRY: Record<string, ComponentType<GameClientProps>> = {
  "tic-tac-toe": lazy(() =>
    import("./games/tic-tac-toe/client").then((m) => ({
      default: m.TicTacToeGameClient,
    })),
  ),
};

export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  return REGISTRY[gameType] ?? null;
}
