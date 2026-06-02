import { type ComponentType, lazy } from "react";
import type { GameClientProps } from "./types";

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
