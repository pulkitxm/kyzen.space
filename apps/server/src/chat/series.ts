import type { GameRecord } from "@kyzen/database";
import type { SeriesScore, SeriesScoreEntry } from "@kyzen/shared/types";

export function computeSeriesScore(seriesGames: GameRecord[]): SeriesScore {
  const byUser = new Map<string, SeriesScoreEntry>();
  for (const g of seriesGames) {
    for (const p of g.players) {
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, {
          userId: p.userId,
          username: p.username,
          wins: 0,
          avatar: p.avatar ?? null,
        });
      }
    }
  }

  let draws = 0;
  let completedGames = 0;
  for (const g of seriesGames) {
    if (g.status !== "completed") continue;
    completedGames += 1;
    if (g.winner === "draw") {
      draws += 1;
      continue;
    }
    const winners = g.winners?.length ? g.winners : g.winner ? [g.winner] : [];
    for (const winner of winners) {
      const entry = byUser.get(winner);
      if (entry) entry.wins += 1;
    }
  }

  return {
    entries: [...byUser.values()],
    draws,
    completedGames,
    totalGames: seriesGames.length,
  };
}
