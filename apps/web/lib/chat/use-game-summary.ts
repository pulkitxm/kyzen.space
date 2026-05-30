"use client";

import type { GameJson } from "@gamelobby/games-core";
import { useAtomValue, useStore } from "jotai";
import { useEffect } from "react";
import { clientFetchJson } from "@/lib/api-client";
import { type GameSummary, gameSummariesAtom } from "@/lib/chat/atoms";

/**
 * Live status for an in-chat game card: seeds the shared atom once from
 * GET /api/games/:id, then reflects `game_update` socket broadcasts.
 */
export function useGameSummary(gameId: string): GameSummary | null {
  const store = useStore();
  const summaries = useAtomValue(gameSummariesAtom);

  useEffect(() => {
    if (store.get(gameSummariesAtom).has(gameId)) return;
    let active = true;
    void clientFetchJson<{ game: GameJson }>(`/api/games/${gameId}`)
      .then(({ game }) => {
        if (!active) return;
        store.set(gameSummariesAtom, (prev) => {
          if (prev.has(gameId)) return prev;
          const next = new Map(prev);
          next.set(gameId, {
            status: game.status,
            winner: game.winner,
            players: game.players,
          });
          return next;
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [gameId, store]);

  return summaries.get(gameId) ?? null;
}
