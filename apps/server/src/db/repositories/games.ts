import type { GameType } from "@gamelobby/games-core";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "../client";
import {
  type GamePlayer,
  type GameRow,
  type GameStatus,
  game,
  gamePlayer,
  type MoveRow,
  move,
  type SeatingMode,
} from "../schema";

export type GameRecord = Omit<GameRow, "gameType"> & {
  gameType: GameType;
  players: GamePlayer[];
};

function toGameRecord(row: GameRow, players: GamePlayer[]): GameRecord {
  return { ...row, gameType: row.gameType as GameType, players };
}

export type CreateGameInput = {
  gameType: GameType;
  players: GamePlayer[];
  gameState: unknown;
  config?: unknown;
  status?: GameStatus;
  conversationId?: string | null;
  creatorUserId?: string | null;
  seatingMode?: SeatingMode | null;
  challengedUserId?: string | null;
};

export async function createGame(input: CreateGameInput): Promise<GameRecord> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(game)
      .values({
        gameType: input.gameType,
        status: input.status ?? "waiting",
        gameState: input.gameState,
        config: input.config ?? null,
        winner: null,
        conversationId: input.conversationId ?? null,
        creatorUserId: input.creatorUserId ?? null,
        seatingMode: input.seatingMode ?? null,
        challengedUserId: input.challengedUserId ?? null,
      })
      .returning();
    if (!row) throw new Error("Failed to create game");
    const created = row;
    if (input.players.length) {
      await tx.insert(gamePlayer).values(
        input.players.map((p, i) => ({
          gameId: created.id,
          userId: p.userId,
          username: p.username,
          role: p.role,
          seatOrder: i,
        })),
      );
    }
    return toGameRecord(created, input.players);
  });
}

export async function getPlayers(gameId: string): Promise<GamePlayer[]> {
  const rows = await db
    .select()
    .from(gamePlayer)
    .where(eq(gamePlayer.gameId, gameId))
    .orderBy(gamePlayer.seatOrder);
  return rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    role: r.role,
  }));
}

export async function getGameById(id: string): Promise<GameRecord | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  if (!row) return null;
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}

export async function seatPlayer(
  gameId: string,
  player: GamePlayer,
  seatOrder: number,
): Promise<void> {
  await db.insert(gamePlayer).values({
    gameId,
    userId: player.userId,
    username: player.username,
    role: player.role,
    seatOrder,
  });
}

export type GameUpdate = Partial<
  Pick<GameRow, "status" | "winner" | "gameState" | "startedAt" | "completedAt">
>;

export async function updateGame(
  id: string,
  patch: GameUpdate,
): Promise<GameRecord> {
  const [row] = await db
    .update(game)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(game.id, id))
    .returning();
  if (!row) throw new Error("Failed to update game");
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}

export async function gamesForUser(
  userId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<GameRow[]> {
  return db
    .select(getTableColumns(game))
    .from(game)
    .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
    .where(eq(gamePlayer.userId, userId))
    .orderBy(desc(game.updatedAt))
    .offset(opts.offset ?? 0)
    .limit(opts.limit ?? 20);
}

export async function listMoves(gameId: string): Promise<MoveRow[]> {
  return db
    .select()
    .from(move)
    .where(eq(move.gameId, gameId))
    .orderBy(move.moveNumber);
}

export async function nextMoveNumber(gameId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${move.moveNumber}), 0)` })
    .from(move)
    .where(eq(move.gameId, gameId));
  return (row?.max ?? 0) + 1;
}

export async function addMove(input: {
  gameId: string;
  moveNumber: number;
  playerId: string;
  moveData: unknown;
}): Promise<MoveRow> {
  const [row] = await db.insert(move).values(input).returning();
  if (!row) throw new Error("Failed to add move");
  return row;
}
