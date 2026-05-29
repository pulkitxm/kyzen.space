import type { GameJson, MoveJson } from "@gamelobby/games-core";
import type { GamePlayer, GameRow, MoveRow } from "../db";

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

/** DB game row → client-facing JSON. */
export function serializeGame(row: GameRow): GameJson {
  return {
    id: row.id,
    gameType: row.gameType,
    status: row.status,
    winner: row.winner,
    players: (row.players ?? []) as GamePlayer[],
    gameState: row.gameState ?? null,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

/** DB move row → client-facing JSON. */
export function serializeMove(row: MoveRow): MoveJson {
  return {
    id: row.id,
    gameId: row.gameId,
    moveNumber: row.moveNumber,
    playerId: row.playerId,
    moveData: row.moveData,
    createdAt: iso(row.createdAt),
  };
}
