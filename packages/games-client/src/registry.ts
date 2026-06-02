import { type ComponentType, lazy } from "react";
import { TicTacToeSkeleton } from "./games/tic-tac-toe/skeleton";
import { DefaultGameSkeleton } from "./skeletons";
import type { GameClientProps } from "./types";

const REGISTRY: Record<string, ComponentType<GameClientProps>> = {
  "tic-tac-toe": lazy(() =>
    import("./games/tic-tac-toe/client").then((m) => ({
      default: m.TicTacToeGameClient,
    })),
  ),
};

const SKELETON_REGISTRY: Record<string, ComponentType> = {
  "tic-tac-toe": TicTacToeSkeleton,
};

export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  return REGISTRY[gameType] ?? null;
}

export function getGameSkeleton(gameType: string): ComponentType {
  return SKELETON_REGISTRY[gameType] ?? DefaultGameSkeleton;
}
