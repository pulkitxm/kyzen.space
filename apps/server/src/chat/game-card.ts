import type { GameCardMeta, SeriesScore } from "@kyzen/shared/types";

export type GameCardSnapshot = {
  status: string;
  winner: string | null;
  winners: string[];
  players: { userId: string; username: string; role: string }[];
  seriesScore?: SeriesScore;
  seriesSuperseded?: boolean;
};

export function enrichGameCardMeta(
  base: GameCardMeta,
  game: GameCardSnapshot | null,
): GameCardMeta {
  if (!game) return base;
  return {
    ...base,
    status: game.status,
    winner: game.winner,
    winners: game.winners,
    players: game.players,
    seriesScore: game.seriesScore,
    seriesSuperseded: game.seriesSuperseded,
  };
}
