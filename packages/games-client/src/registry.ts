import { type GameType, TIC_TAC_TOE } from "@gamelobby/games-core";
import { type ComponentType, lazy } from "react";
import { TicTacToeSkeleton } from "./games/tic-tac-toe/skeleton";
import { DefaultGameSkeleton } from "./skeletons";
import type { GameClientProps } from "./types";

const REGISTRY: Record<GameType, ComponentType<GameClientProps>> = {
  [TIC_TAC_TOE]: lazy(() =>
    import("./games/tic-tac-toe/client").then((m) => ({
      default: m.TicTacToeGameClient,
    })),
  ),
};

const SKELETON_REGISTRY: Record<GameType, ComponentType> = {
  [TIC_TAC_TOE]: TicTacToeSkeleton,
};

export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  const registry: Record<string, ComponentType<GameClientProps>> = REGISTRY;
  return registry[gameType] ?? null;
}

export function getGameSkeleton(gameType: string): ComponentType {
  const registry: Record<string, ComponentType> = SKELETON_REGISTRY;
  return registry[gameType] ?? DefaultGameSkeleton;
}
