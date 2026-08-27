"use client";

import type { SeriesScore } from "@kyzen/shared/types";
import { SessionScoreboard } from "@/components/games/session-scoreboard";

export function SeriesScoreboard({ score }: { score: SeriesScore }) {
  const stats = score.entries.map((entry) => {
    let losses = Math.max(0, score.completedGames - entry.wins);
    if (score.entries.length === 2) {
      const opponent = score.entries.find(
        (other) => other.userId !== entry.userId,
      );
      losses = opponent?.wins ?? 0;
    } else {
      losses = Math.max(0, score.completedGames - entry.wins - score.draws);
    }
    return {
      userId: entry.userId,
      username: entry.username,
      avatar: entry.avatar ?? null,
      played: score.completedGames,
      wins: entry.wins,
      losses,
    };
  });

  return <SessionScoreboard stats={stats} draws={score.draws} />;
}
