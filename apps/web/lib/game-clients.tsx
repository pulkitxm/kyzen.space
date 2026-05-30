"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/** Props every game client accepts (matches the existing tic-tac-toe client). */
export type GameClientProps = {
  gameId: string;
  userId: string | null;
  initialGame: {
    id: string;
    status: string;
    winner: string | null;
    players: { userId: string; username: string; role: string }[];
    gameState: unknown;
  };
  initialMoves: Record<string, unknown>[];
};

// Client-only (the game clients open their own socket). Add new games here.
const REGISTRY: Record<string, ComponentType<GameClientProps>> = {
  "tic-tac-toe": dynamic(
    () =>
      import("@/app/games/tic-tac-toe/[gameId]/game-client").then(
        (m) => m.TicTacToeGameClient,
      ),
    { ssr: false },
  ),
};

export function getGameClient(
  gameType: string,
): ComponentType<GameClientProps> | null {
  return REGISTRY[gameType] ?? null;
}
