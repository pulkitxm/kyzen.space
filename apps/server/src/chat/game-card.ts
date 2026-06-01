import type { GameCardMeta } from "@gamelobby/chat-core";

export type GameCardSnapshot = {
  status: string;
  winner: string | null;
  players: { userId: string; username: string; role: string }[];
};

/**
 * Resolve a game's current state onto its chat-card metadata, so the card
 * renders the right status/winner/action on first paint without a client-side
 * game lookup. Pure: takes the stored card metadata plus a live game snapshot
 * and returns the enriched metadata. `null` game (e.g. deleted) leaves the base
 * metadata untouched.
 */
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
  };
}
