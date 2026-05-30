import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import {
  type GamePlayer,
  type GameRow,
  type GameStatus,
  game,
  type MoveRow,
  move,
  type SeatingMode,
} from "../schema";

export type CreateGameInput = {
  gameType: string;
  players: GamePlayer[];
  gameState: unknown;
  status?: GameStatus;
  // Phase 3 — link a game to the conversation it was created from.
  conversationId?: string | null;
  creatorUserId?: string | null;
  seatingMode?: SeatingMode | null;
  challengedUserId?: string | null;
};

export async function createGame(input: CreateGameInput): Promise<GameRow> {
  const [row] = await db
    .insert(game)
    .values({
      gameType: input.gameType,
      status: input.status ?? "waiting",
      players: input.players,
      gameState: input.gameState,
      winner: null,
      conversationId: input.conversationId ?? null,
      creatorUserId: input.creatorUserId ?? null,
      seatingMode: input.seatingMode ?? null,
      challengedUserId: input.challengedUserId ?? null,
    })
    .returning();
  return row!;
}

export async function getGameById(id: string): Promise<GameRow | null> {
  const [row] = await db.select().from(game).where(eq(game.id, id)).limit(1);
  return row ?? null;
}

export type ListGamesFilter = {
  gameType?: string;
  status?: GameStatus;
  limit?: number;
};

export async function listGames(
  filter: ListGamesFilter = {},
): Promise<GameRow[]> {
  const conds = [];
  if (filter.gameType) conds.push(eq(game.gameType, filter.gameType));
  if (filter.status) conds.push(eq(game.status, filter.status));
  return db
    .select()
    .from(game)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(game.createdAt))
    .limit(filter.limit ?? 50);
}

export async function findWaitingGameToJoin(
  gameType: string,
  excludeUserId: string,
): Promise<GameRow | null> {
  const rows = await db
    .select()
    .from(game)
    .where(and(eq(game.gameType, gameType), eq(game.status, "waiting")))
    .orderBy(desc(game.createdAt))
    .limit(20);
  return (
    rows.find(
      (r: GameRow) =>
        !(r.players as GamePlayer[]).some((p) => p.userId === excludeUserId),
    ) ?? null
  );
}

export type GameUpdate = Partial<
  Pick<
    GameRow,
    "status" | "players" | "winner" | "gameState" | "startedAt" | "completedAt"
  >
>;

export async function updateGame(
  id: string,
  patch: GameUpdate,
): Promise<GameRow> {
  const [row] = await db
    .update(game)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(game.id, id))
    .returning();
  return row!;
}

export async function gamesForUser(
  userId: string,
  opts: { offset?: number; limit?: number } = {},
): Promise<GameRow[]> {
  const member = sql`${game.players} @> ${JSON.stringify([{ userId }])}::jsonb`;
  return db
    .select()
    .from(game)
    .where(member)
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
  return row!;
}
