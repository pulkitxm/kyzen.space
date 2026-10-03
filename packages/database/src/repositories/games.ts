import { randomInt, randomUUID } from "node:crypto";
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
  type Outcome,
} from "@kyzen/shared/types";
import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "../client";
import {
  game,
  gamePlayer,
  matchmakingTicket,
  move,
  userProfile,
} from "../schema";

const GAME_CODE_MAX_ATTEMPTS = 5;

function isGameCodeCollision(error: unknown): boolean {
  const e = error as {
    code?: string;
    constraint_name?: string;
    cause?: { code?: string; constraint_name?: string };
  };
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint_name ?? e?.cause?.constraint_name;
  return code === "23505" && constraint === "game_code_uq";
}

function toGameRecord(row: GameRow, players: GamePlayer[]): GameRecord {
  return { ...row, gameType: row.gameType as GameType, players };
}

export async function createGame(input: CreateGameInput): Promise<GameRecord> {
  createGameInputSchema.parse(input);
  for (let attempt = 1; attempt <= GAME_CODE_MAX_ATTEMPTS; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        return insertGame(tx, input);
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
  opts: { offset?: number; limit?: number; includePublic?: boolean } = {},
): Promise<GameRow[]> {
  return db
    .select(getTableColumns(game))
    .from(game)
    .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
    .where(
      and(
        eq(gamePlayer.userId, userId),
        opts.includePublic ? undefined : eq(game.publicMatch, false),
      ),
    )
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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertGame(
  tx: Transaction,
  input: CreateGameInput,
): Promise<GameRecord> {
  const id = randomUUID();
  const [row] = await tx
    .insert(game)
    .values({
      id,
      publicMatch: input.publicMatch ?? false,
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
}

export async function joinMatchmaking(input: {
  userId: string;
  owner: string;
  gameType: GameType;
  config: unknown;
  roles: readonly string[];
  gameState: unknown;
}): Promise<{ code: string; userIds: string[] } | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802938)`);
    const [active] = await tx
      .select({ code: game.code })
      .from(game)
      .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
      .where(
        and(
          eq(gamePlayer.userId, input.userId),
          eq(game.publicMatch, true),
          eq(game.status, "active"),
        ),
      )
      .limit(1);
    if (active) return { code: active.code, userIds: [input.userId] };
    const expiresAt = new Date(Date.now() + 45000);
    const [ticket] = await tx
      .select({
        joinedAt: matchmakingTicket.joinedAt,
        samePool: sql<boolean>`${matchmakingTicket.gameType} = ${input.gameType} and ${matchmakingTicket.config} = ${JSON.stringify(input.config)}::jsonb and ${matchmakingTicket.expiresAt} > now()`,
      })
      .from(matchmakingTicket)
      .where(eq(matchmakingTicket.userId, input.userId));
    await tx
      .insert(matchmakingTicket)
      .values({ ...input, expiresAt })
      .onConflictDoUpdate({
        target: matchmakingTicket.userId,
        set: {
          owner: input.owner,
          gameType: input.gameType,
          config: input.config,
          expiresAt,
          joinedAt: ticket?.samePool ? ticket.joinedAt : new Date(),
        },
      });
    const opponents = await tx
      .select()
      .from(matchmakingTicket)
      .where(
        and(
          eq(matchmakingTicket.gameType, input.gameType),
          ne(matchmakingTicket.userId, input.userId),
          gt(matchmakingTicket.expiresAt, new Date()),
          sql`${matchmakingTicket.config} = ${JSON.stringify(input.config)}::jsonb`,
        ),
      )
      .orderBy(matchmakingTicket.joinedAt, matchmakingTicket.userId)
      .limit(input.roles.length - 1);
    if (opponents.length < input.roles.length - 1) return null;
    const userIds = [...opponents.map((ticket) => ticket.userId), input.userId];
    for (let index = userIds.length - 1; index > 0; index--) {
      const other = randomInt(index + 1);
      [userIds[index], userIds[other]] = [
        userIds[other] ?? "",
        userIds[index] ?? "",
      ];
    }
    const players = userIds.map((userId, index) => ({
      userId,
      username: `Player ${index + 1}`,
      role: input.roles[index] ?? "",
    }));
    const created = await insertGame(tx, {
      publicMatch: true,
      gameType: input.gameType,
      players,
      gameState: input.gameState,
      config: input.config,
      status: "active",
    });
    await tx
      .update(game)
      .set({ startedAt: new Date() })
      .where(eq(game.id, created.id));
    await tx
      .delete(matchmakingTicket)
      .where(inArray(matchmakingTicket.userId, userIds));
    return { code: created.code, userIds };
  });
}

export async function releaseMatchmakingOwner(owner: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802938)`);
    await tx
      .delete(matchmakingTicket)
      .where(eq(matchmakingTicket.owner, owner));
  });
}

export async function leaveMatchmaking(
  userId: string,
  owner: string,
  gameType: GameType,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(802938)`);
    await tx
      .delete(matchmakingTicket)
      .where(
        and(
          eq(matchmakingTicket.userId, userId),
          eq(matchmakingTicket.owner, owner),
          eq(matchmakingTicket.gameType, gameType),
        ),
      );
    const [active] = await tx
      .select({ code: game.code })
      .from(game)
      .innerJoin(gamePlayer, eq(gamePlayer.gameId, game.id))
      .where(
        and(
          eq(gamePlayer.userId, userId),
          eq(game.publicMatch, true),
          eq(game.status, "active"),
        ),
      )
      .limit(1);
    return active?.code ?? null;
  });
}

export async function persistGameMove(input: {
  previous: GameRecord;
  playerId: string;
  moveData: unknown;
  gameState: unknown;
  outcome: Outcome;
}): Promise<{ game: GameRecord; move: MoveRow } | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(game)
      .where(
        and(
          eq(game.id, input.previous.id),
          eq(game.status, "active"),
          sql`${game.gameState} = ${JSON.stringify(input.previous.gameState)}::jsonb`,
        ),
      )
      .for("update");
    if (!locked) return null;
    const outcome = input.outcome;
    const completed = outcome.status === "completed";
    const winnerRole =
      outcome.status === "completed" ? outcome.winnerRole : null;
    const winner =
      outcome.status === "completed"
        ? outcome.draw
          ? "draw"
          : (input.previous.players.find((player) => player.role === winnerRole)
              ?.userId ?? null)
        : null;
    const [updated] = await tx
      .update(game)
      .set({
        gameState: input.gameState,
        status: completed ? "completed" : "active",
        winner,
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(game.id, locked.id))
      .returning();
    const [number] = await tx
      .select({ next: sql<number>`coalesce(max(${move.moveNumber}), 0) + 1` })
      .from(move)
      .where(eq(move.gameId, locked.id));
    const [saved] = await tx
      .insert(move)
      .values({
        gameId: locked.id,
        playerId: input.playerId,
        moveData: input.moveData,
        moveNumber: number?.next ?? 1,
      })
      .returning();
    if (!updated || !saved) throw new Error("Move could not be saved");
    if (completed) await updateMatchStats(tx, input.previous, winner);
    return { game: toGameRecord(updated, input.previous.players), move: saved };
  });
}

async function updateMatchStats(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  record: GameRecord,
  winner: string | null,
  winningRoles?: readonly string[],
) {
  const winningRoleSet = winningRoles ? new Set(winningRoles) : null;
  for (const player of [...record.players].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  )) {
    const [profile] = await tx
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, player.userId))
      .for("update");
    if (!profile) continue;
    const stats = { ...profile.stats };
    const current = stats[record.gameType] ?? {
      played: 0,
      won: 0,
      lost: 0,
      drawn: 0,
    };
    stats[record.gameType] = {
      played: current.played + 1,
      won:
        current.won +
        (winningRoleSet
          ? Number(winningRoleSet.has(player.role))
          : Number(winner === player.userId)),
      lost:
        current.lost +
        (winner !== "draw" &&
        (winningRoleSet
          ? !winningRoleSet.has(player.role)
          : winner !== player.userId)
          ? 1
          : 0),
      drawn: current.drawn + (winner === "draw" ? 1 : 0),
    };
    await tx
      .update(userProfile)
      .set({ stats, updatedAt: new Date() })
      .where(eq(userProfile.userId, player.userId));
  }
}

export async function completeRealtimeGame(input: {
  previous: GameRecord;
  gameState: unknown;
  winnerRole: string | null;
  winningRoles: readonly string[];
}): Promise<GameRecord | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(game)
      .where(and(eq(game.id, input.previous.id), eq(game.status, "active")))
      .for("update");
    if (!locked) return null;
    const winner = input.winnerRole
      ? (input.previous.players.find(
          (player) => player.role === input.winnerRole,
        )?.userId ?? null)
      : "draw";
    const [updated] = await tx
      .update(game)
      .set({
        gameState: input.gameState,
        status: "completed",
        winner,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(game.id, locked.id))
      .returning();
    if (!updated) throw new Error("Realtime game could not be completed");
    await updateMatchStats(tx, input.previous, winner, input.winningRoles);
    return toGameRecord(updated, input.previous.players);
  });
}

export async function abortActiveGame(
  previous: GameRecord,
  winner: string | null,
): Promise<GameRecord | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(game)
      .set({
        status: "aborted",
        winner,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(game.id, previous.id),
          eq(game.status, "active"),
          sql`${game.gameState} = ${JSON.stringify(previous.gameState)}::jsonb`,
        ),
      )
      .returning();
    if (!updated) return null;
    if (winner) await updateMatchStats(tx, previous, winner);
    return toGameRecord(updated, previous.players);
  });
}
