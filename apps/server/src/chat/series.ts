import type { GameRecord } from "@kyzen/database";
import { CAR_FOOTBALL } from "@kyzen/shared/constants";
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
    } else if (g.winner) {
      const winner = g.players.find((player) => player.userId === g.winner);
      const winningTeam = winner?.role.split("-")[0];
      for (const player of g.players) {
        const won =
          player.userId === g.winner ||
          (g.gameType === CAR_FOOTBALL &&
            winningTeam &&
            player.role.startsWith(`${winningTeam}-`));
        const entry = byUser.get(player.userId);
        if (entry && won) entry.wins += 1;
      }
    }
  }

  return {
    entries: [...byUser.values()],
    draws,
    completedGames,
    totalGames: seriesGames.length,
  };
}
