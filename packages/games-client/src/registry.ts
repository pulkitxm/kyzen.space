import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameType } from "@kyzen/shared/types";
import type { ComponentType } from "react";
import { TicTacToeGameClient } from "./games/tic-tac-toe/client";
import { TicTacToeSkeleton } from "./games/tic-tac-toe/skeleton";
import { DefaultGameSkeleton } from "./skeletons";
import type { GameClientProps } from "./types";

const REGISTRY: Record<
  GameType,
  { Board: ComponentType<GameClientProps>; Skeleton?: ComponentType }
> = {
  [TIC_TAC_TOE]: { Board: TicTacToeGameClient, Skeleton: TicTacToeSkeleton },
};

function getEntry(gameType: string) {
  return Object.hasOwn(REGISTRY, gameType)
    ? REGISTRY[gameType as GameType]
    : null;
}

export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  return getEntry(gameType)?.Board ?? null;
}

export function getGameSkeleton(gameType: string): ComponentType {
  return getEntry(gameType)?.Skeleton ?? DefaultGameSkeleton;
}
