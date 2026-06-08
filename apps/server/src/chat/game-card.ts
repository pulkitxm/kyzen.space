import type { GameCardMeta, SeriesScore } from "@gamelobby/shared/types";

export type GameCardSnapshot = {
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  seriesScore?: SeriesScore;
};

export function enrichGameCardMeta(
  base: GameCardMeta,
  game: GameCardSnapshot | null,
): GameCardMeta {
  if (!game) return base;
  const winnerUsername =
    game.winner && game.winner !== "draw"
      ? (game.players.find((p) => p.userId === game.winner)?.username ?? null)
      : null;
  return {
    ...base,
    status: game.status,
    winner: game.winner,
    winnerUsername,
    players: game.players,
    seriesScore: game.seriesScore,
  };
}
