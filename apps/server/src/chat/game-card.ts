import {
  type GameCardMeta,
  resolveWinnerUsername,
  type SeriesScore,
} from "@kyzen/shared/types";

export type GameCardSnapshot = {
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
  seriesScore?: SeriesScore;
  seriesSuperseded?: boolean;
};

export function enrichGameCardMeta(
  base: GameCardMeta,
  game: GameCardSnapshot | null,
): GameCardMeta {
  if (!game) return base;
  const winnerUsername = resolveWinnerUsername(
    game.winner,
    game.players,
    base.gameType,
  );
  return {
    ...base,
    status: game.status,
    winner: game.winner,
    winnerUsername,
    players: game.players,
    seriesScore: game.seriesScore,
    seriesSuperseded: game.seriesSuperseded,
  };
}
