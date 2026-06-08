import { randomUUID } from "node:crypto";
import {
  addMoveInputSchema,
  type CreateGameInput,
  createGameInputSchema,
  type GamePlayer,
  type GameRecord,
  type GameRow,
  type GameType,
  type GameUpdate,
  type MoveRow,
  normalizeGameCode,
} from "@gamelobby/shared/types";
import { and, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { game, gamePlayer, move, userProfile } from "../schema";

const GAME_CODE_MAX_ATTEMPTS = 5;

function isGameCodeCollision(error: unknown): boolean {
  const e = error as { code?: string; constraint_name?: string };
  return e?.code === "23505" && e?.constraint_name === "game_code_uq";
}

function toGameRecord(row: GameRow, players: GamePlayer[]): GameRecord {
  return { ...row, gameType: row.gameType as GameType, players };
}

export async function createGame(input: CreateGameInput): Promise<GameRecord> {
  createGameInputSchema.parse(input);
  for (let attempt = 1; attempt <= GAME_CODE_MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const id = randomUUID();
        const [row] = await tx
          .insert(game)
          .values({
            id,
            gameType: input.gameType,
            status: input.status ?? "waiting",
            gameState: input.gameState,
            config: input.config ?? null,
            winner: null,
            seriesId: input.seriesId ?? id,
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
    } catch (error) {
      if (!isGameCodeCollision(error)) throw error;
    }
  }
  throw new Error("Failed to allocate a unique game code");
}

export async function getPlayers(gameId: string): Promise<GamePlayer[]> {
  const rows = await db
    .select({
      userId: gamePlayer.userId,
      username: gamePlayer.username,
      role: gamePlayer.role,
      avatar: userProfile.avatar,
    })
    .from(gamePlayer)
    .leftJoin(userProfile, eq(userProfile.userId, gamePlayer.userId))
    .where(eq(gamePlayer.gameId, gameId))
    .orderBy(gamePlayer.seatOrder);
  return rows.map((r) => ({
    userId: r.userId,
    username: r.username,
    role: r.role,
    avatar: r.avatar ?? null,
  }));
}

export async function getGameById(id: string): Promise<GameRecord | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  if (!row) return null;
  const players = await getPlayers(id);
  return toGameRecord(row, players);
}

export async function getGameByCode(code: string): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(eq(game.code, normalizeGameCode(code)))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}

export async function getSeriesGames(seriesId: string): Promise<GameRecord[]> {
  const rows = await db
    .select()
    .from(game)
    .where(eq(game.seriesId, seriesId))
    .orderBy(game.createdAt);
  const records: GameRecord[] = [];
  for (const row of rows) {
    const players = await getPlayers(row.id);
    records.push(toGameRecord(row, players));
  }
  return records;
}

export async function findLiveGameInConversation(
  conversationId: string,
  gameType: GameType,
): Promise<GameRecord | null> {
  const [row] = await db
    .select()
    .from(game)
    .where(
      and(
        eq(game.conversationId, conversationId),
        eq(game.gameType, gameType),
        inArray(game.status, ["waiting", "active"]),
      ),
    )
    .orderBy(desc(game.createdAt))
    .limit(1);
  if (!row) return null;
  const players = await getPlayers(row.id);
  return toGameRecord(row, players);
}

export async function seatPlayer(
  gameId: string,
  player: GamePlayer,
  seatOrder: number,
): Promise<boolean> {
  const rows = await db
    .insert(gamePlayer)
    .values({
      gameId,
      userId: player.userId,
      username: player.username,
      role: player.role,
      seatOrder,
    })
    .onConflictDoNothing({ target: [gamePlayer.gameId, gamePlayer.userId] })
    .returning({ id: gamePlayer.id });
  return rows.length > 0;
}

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
  addMoveInputSchema.parse(input);
  const [row] = await db.insert(move).values(input).returning();
  if (!row) throw new Error("Failed to add move");
  return row;
}
