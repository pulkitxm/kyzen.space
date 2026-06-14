import { SEA_BATTLE, TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameType } from "@kyzen/shared/types";
import { type ComponentType, lazy } from "react";
import { SeaBattleSkeleton } from "./games/sea-battle/skeleton";
import { TicTacToeGameClient } from "./games/tic-tac-toe/client";
import { TicTacToeSkeleton } from "./games/tic-tac-toe/skeleton";
import { DefaultGameSkeleton } from "./skeletons";
import type { GameClientProps } from "./types";

const SeaBattleGameClient = lazy(() =>
  import("./games/sea-battle/client").then((m) => ({
    default: m.SeaBattleGameClient,
  })),
);

const REGISTRY: Record<GameType, ComponentType<GameClientProps>> = {
  [TIC_TAC_TOE]: TicTacToeGameClient,
  [SEA_BATTLE]: SeaBattleGameClient,
};

const SKELETON_REGISTRY: Record<GameType, ComponentType> = {
  [TIC_TAC_TOE]: TicTacToeSkeleton,
  [SEA_BATTLE]: SeaBattleSkeleton,
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
